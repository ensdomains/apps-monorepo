import { Result } from 'neverthrow'
import * as v from 'valibot'

const QUANTITY = v.pipe(v.string(), v.regex(/^0x[0-9a-f]+$/i))
const HASH = v.pipe(v.string(), v.regex(/^0x[0-9a-f]{64}$/i))
const REQUEST = v.object({
  method: v.string(),
  params: v.optional(v.array(v.unknown())),
})
const HEADER = v.object({ number: QUANTITY, hash: HASH })
const RANGE = v.object({ fromBlock: QUANTITY, toBlock: QUANTITY })
const READ_METHODS: ReadonlySet<string> = new Set([
  'eth_chainId',
  'net_version',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getLogs',
  'eth_call',
  'eth_getCode',
  'eth_getBalance',
  'eth_getStorageAt',
  'eth_getProof',
  'eth_getTransactionCount',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_blobBaseFee',
  'eth_createAccessList',
  'eth_simulateV1',
])
const HEADER_METHODS: ReadonlySet<string> = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
])

export type UpgradeReadRequest = Readonly<v.InferOutput<typeof REQUEST>>
export type UpgradeReadHeader = Readonly<v.InferOutput<typeof HEADER>>
export type UpgradeReadPlan =
  | { readonly status: 'unsupported' }
  | {
      readonly status: 'read'
      readonly request: UpgradeReadRequest
      readonly key: string
      readonly canShare: boolean
      readonly pin:
        | { readonly kind: 'exact'; readonly number: string }
        | { readonly kind: 'range'; readonly number: string }
        | null
    }

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value))
    return value.map((entry: unknown) => canonicalValue(entry))
  const record = v.safeParse(v.record(v.string(), v.unknown()), value)
  return record.success
    ? Object.fromEntries(
        Object.entries(record.output)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, canonicalValue(entry)]),
      )
    : value
}

export const getUpgradeReadPlan = (input: unknown): UpgradeReadPlan => {
  const parsed = v.safeParse(REQUEST, input)
  if (!parsed.success || !READ_METHODS.has(parsed.output.method))
    return { status: 'unsupported' }
  const request = parsed.output
  const key = Result.fromThrowable(() =>
    JSON.stringify(canonicalValue(request)),
  )().unwrapOr(null)
  if (!key) return { status: 'unsupported' }
  const params = request.params ?? []
  const block = v.safeParse(QUANTITY, params[1])
  if (
    (request.method === 'eth_call' || request.method === 'eth_getCode') &&
    params.length === 2 &&
    block.success
  )
    return {
      status: 'read',
      request,
      key,
      canShare: true,
      pin: { kind: 'exact', number: BigInt(block.output).toString() },
    }
  const range = v.safeParse(RANGE, params[0])
  if (
    request.method === 'eth_getLogs' &&
    params.length === 1 &&
    range.success &&
    BigInt(range.output.fromBlock) <= BigInt(range.output.toBlock)
  )
    return {
      status: 'read',
      request,
      key,
      canShare: true,
      pin: { kind: 'range', number: BigInt(range.output.toBlock).toString() },
    }
  return {
    status: 'read',
    request,
    key,
    canShare: HEADER_METHODS.has(request.method),
    pin: null,
  }
}

export const getUpgradeReadHeader = (
  request: UpgradeReadRequest,
  response: unknown,
): UpgradeReadHeader | null => {
  if (
    request.method !== 'eth_getBlockByNumber' &&
    request.method !== 'eth_getBlockByHash'
  )
    return null
  const parsed = v.safeParse(HEADER, response)
  if (!parsed.success) return null
  const header = {
    number: BigInt(parsed.output.number).toString(),
    hash: parsed.output.hash.toLowerCase(),
  }
  const requested = request.params?.[0]
  if (request.method === 'eth_getBlockByHash')
    return typeof requested === 'string' &&
      requested.toLowerCase() === header.hash
      ? header
      : null
  const number = v.safeParse(QUANTITY, requested)
  if (
    !number.success &&
    !['latest', 'earliest', 'safe', 'finalized'].includes(String(requested))
  )
    return null
  return number.success && BigInt(number.output).toString() !== header.number
    ? null
    : header
}

export const getUpgradeReadReuseKey = (
  plan: Extract<UpgradeReadPlan, { readonly status: 'read' }>,
  headers: ReadonlyMap<string, string>,
): string | null => {
  if (!plan.pin) return null
  const number =
    plan.pin.kind === 'exact'
      ? plan.pin.number
      : [...headers.keys()]
          .filter((number) => BigInt(number) >= BigInt(plan.pin?.number ?? '0'))
          .sort((a, b) =>
            BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0,
          )[0]
  const hash = number === undefined ? undefined : headers.get(number)
  return hash ? JSON.stringify([plan.key, number, hash]) : null
}

export type UpgradeReadObservations = {
  readonly generation: number
  readonly order: number
  readonly head: UpgradeReadHeader | null
  readonly headers: ReadonlyMap<string, string>
}

/** An older response cannot replace the checkpoint established by a newer read. */
export const observeUpgradeReadHeader = (
  state: UpgradeReadObservations,
  input: {
    readonly request: UpgradeReadRequest
    readonly response: unknown
    readonly order: number
    readonly generation: number
  },
): UpgradeReadObservations => {
  const header = getUpgradeReadHeader(input.request, input.response)
  if (!header) return state
  const isLatest =
    input.request.method === 'eth_getBlockByNumber' &&
    input.request.params?.[0] === 'latest'
  const previousHash = state.headers.get(header.number)
  if (input.generation !== state.generation || input.order < state.order) {
    const isCompatible =
      previousHash === header.hash &&
      (!isLatest ||
        (state.head?.number === header.number &&
          state.head.hash === header.hash))
    return isCompatible
      ? state
      : {
          ...state,
          generation: state.generation + 1,
          head: null,
          headers: new Map(),
        }
  }
  const hasNewHead =
    isLatest &&
    (state.head
      ? state.head.number !== header.number || state.head.hash !== header.hash
      : state.headers.size > 0)
  const hasReplacement =
    previousHash !== undefined && previousHash !== header.hash
  const hasChanged = hasNewHead || hasReplacement
  return {
    generation: state.generation + Number(hasChanged),
    order: input.order,
    head: isLatest ? header : hasChanged ? null : state.head,
    headers: hasChanged
      ? new Map([[header.number, header.hash]])
      : new Map([...state.headers, [header.number, header.hash]]),
  }
}
