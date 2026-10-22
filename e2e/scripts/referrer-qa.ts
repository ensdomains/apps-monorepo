/** Read-only receipt/event verification. Never loads app configuration or a wallet. */
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import {
  ethRegistrarCommitmentMadeEventSnippet,
  ethRegistrarMakeCommitmentSnippet,
  ethRegistrarNameRegisteredEventSnippet,
  ethRegistrarNameRenewedEventSnippet,
  ethRegistrarRegisterSnippet,
} from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import {
  type Address,
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  type Hex,
  isAddress,
  toEventSelector,
  toFunctionSelector,
} from 'viem'

class VerificationError extends Error {}

const EVENTS = [
  ethRegistrarNameRegisteredEventSnippet,
  ethRegistrarNameRenewedEventSnippet,
  ethRegistrarCommitmentMadeEventSnippet,
] as const
const REGISTER_SELECTOR = toFunctionSelector(
  'register(string,address,bytes32,address,address,uint64,address,bytes32)',
)
type RpcMethod =
  | 'eth_chainId'
  | 'eth_getTransactionReceipt'
  | 'eth_getTransactionByHash'
  | 'eth_call'
  | 'debug_traceTransaction'
type Rpc = (method: RpcMethod, params: readonly unknown[]) => Promise<unknown>
type Kind = 'registration' | 'renewal'
interface Receipt {
  readonly blockNumber: Hex
  readonly transactionIndex: Hex
  readonly logs: readonly EventLog[]
}
export interface EventLog {
  readonly address: Address
  readonly topics: readonly Hex[]
  readonly data: Hex
}

function requireCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new VerificationError(message)
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(value)
}
function isQuantity(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)
}

function hash(value: unknown): Hex {
  requireCheck(
    isHex(value) && value.length === 66,
    'Expected a 32-byte transaction hash.',
  )
  return value
}

/** Independent implementation of the documented input rule, not the app helper. */
export function expectedReferrer(value: string | undefined): Hex {
  if (!value || !/^0x[0-9a-fA-F]{1,64}$/.test(value))
    return `0x${'0'.repeat(64)}`
  return `0x${value.slice(2).toLowerCase().padStart(64, '0')}`
}

function receipt(value: unknown): Receipt {
  requireCheck(
    isRecord(value),
    'Receipt not found. Check the network, hash, and confirmations.',
  )
  requireCheck(
    value.status === '0x1',
    'Transaction reverted or has no successful receipt.',
  )
  requireCheck(
    isQuantity(value.blockNumber) && isQuantity(value.transactionIndex),
    'Receipt has invalid block metadata.',
  )
  requireCheck(Array.isArray(value.logs), 'Receipt has no log array.')
  const logs = value.logs.map((log: unknown): EventLog => {
    requireCheck(
      isRecord(log) &&
        typeof log.address === 'string' &&
        isAddress(log.address),
      'Invalid event address.',
    )
    requireCheck(
      Array.isArray(log.topics) && log.topics.every(isHex) && isHex(log.data),
      'Invalid event encoding.',
    )
    return { address: log.address, topics: log.topics as Hex[], data: log.data }
  })
  return {
    blockNumber: value.blockNumber,
    transactionIndex: value.transactionIndex,
    logs,
  }
}

function contractEvents(
  logs: readonly EventLog[],
  contract: Address,
): ReturnType<typeof decodeEventLog<typeof EVENTS>>[] {
  const signatures = EVENTS.map(toEventSelector)
  return logs
    .filter(
      (log) =>
        log.address.toLowerCase() === contract.toLowerCase() &&
        signatures.includes(log.topics[0]),
    )
    .map((log) =>
      decodeEventLog({
        abi: EVENTS,
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data,
        strict: true,
      }),
    )
}

/** Every requested label must have exactly one matching event from this contract. */
export function verifyRecordedReferrers(params: {
  readonly logs: readonly EventLog[]
  readonly contract: Address
  readonly kind: Kind
  readonly names: readonly string[]
  readonly expected: Hex
}): readonly string[] {
  requireCheck(
    params.names.length > 0 &&
      new Set(params.names).size === params.names.length,
    'Supply a nonempty list of unique names.',
  )
  const labels = params.names.map((name) => {
    requireCheck(
      name.endsWith('.eth') && name.split('.').length === 2 && name !== '.eth',
      'Names must be exact .eth second-level names, e.g. alice.eth.',
    )
    return name.slice(0, -4)
  })
  const events = contractEvents(params.logs, params.contract).filter((event) =>
    params.kind === 'registration'
      ? event.eventName === 'NameRegistered'
      : event.eventName === 'NameRenewed',
  )
  requireCheck(
    events.length === labels.length,
    `Expected ${labels.length} ${params.kind} event(s) from the specified contract, found ${events.length}. Check the contract address, transaction, and ABI.`,
  )
  return labels.map((label) => {
    const matches = events.filter(
      (event) =>
        event.eventName !== 'CommitmentMade' && event.args.label === label,
    )
    requireCheck(
      matches.length === 1,
      `Expected exactly one event for ${label}.eth.`,
    )
    const event = matches[0]
    requireCheck(
      event &&
        event.eventName !== 'CommitmentMade' &&
        event.args.referrer.toLowerCase() === params.expected,
      `Recorded referrer mismatch for ${label}.eth.`,
    )
    return `${label}.eth: ${params.expected}`
  })
}

/** Reverted trace branches cannot be used as evidence of a successful register. */
export function registrationInputs(
  trace: unknown,
  contract: Address,
  depth = 0,
): readonly Hex[] {
  requireCheck(
    depth < 128 && isRecord(trace),
    'Invalid or excessively deep callTracer trace.',
  )
  if (trace.error) return []
  const input = trace.input
  const own =
    typeof trace.to === 'string' &&
    trace.to.toLowerCase() === contract.toLowerCase() &&
    isHex(input) &&
    input.slice(0, 10) === REGISTER_SELECTOR
      ? [input]
      : []
  requireCheck(
    trace.calls === undefined || Array.isArray(trace.calls),
    'Invalid trace calls.',
  )
  return [
    ...own,
    ...(trace.calls ?? []).flatMap((call: unknown) =>
      registrationInputs(call, contract, depth + 1),
    ),
  ]
}

export async function verifyCommitment(params: {
  readonly rpc: Rpc
  readonly reveal: Receipt
  readonly commit: Receipt
  readonly contract: Address
  readonly input: Hex
  readonly name: string
  readonly expected: Hex
}): Promise<Hex> {
  const { rpc, reveal, commit, contract, input, name, expected } = params
  requireCheck(
    BigInt(commit.blockNumber) < BigInt(reveal.blockNumber) ||
      (commit.blockNumber === reveal.blockNumber &&
        BigInt(commit.transactionIndex) < BigInt(reveal.transactionIndex)),
    'Commit transaction must precede the reveal.',
  )
  const decoded = decodeFunctionData({
    abi: ethRegistrarRegisterSnippet,
    data: input,
  })
  const [
    label,
    owner,
    secret,
    subregistry,
    resolver,
    duration,
    paymentToken,
    referrer,
  ] = decoded.args
  requireCheck(
    `${label}.eth` === name && referrer.toLowerCase() === expected,
    'Reveal calldata has a different name or referrer.',
  )
  const events = contractEvents(reveal.logs, contract).filter(
    (event) => event.eventName === 'NameRegistered',
  )
  requireCheck(
    events.some(
      (event) =>
        event.args.label === label &&
        event.args.owner.toLowerCase() === owner.toLowerCase() &&
        event.args.subregistry.toLowerCase() === subregistry.toLowerCase() &&
        event.args.resolver.toLowerCase() === resolver.toLowerCase() &&
        event.args.duration === duration &&
        event.args.paymentToken.toLowerCase() === paymentToken.toLowerCase() &&
        event.args.referrer.toLowerCase() === referrer.toLowerCase(),
    ),
    'Reveal calldata does not match the successful registration event.',
  )
  const data = encodeFunctionData({
    abi: ethRegistrarMakeCommitmentSnippet,
    functionName: 'makeCommitment',
    args: [label, owner, secret, subregistry, resolver, duration, referrer],
  })
  const result = await rpc('eth_call', [
    { to: contract, data },
    reveal.blockNumber,
  ])
  const reconstructed = hash(result)
  requireCheck(
    contractEvents(commit.logs, contract).some(
      (event) =>
        event.eventName === 'CommitmentMade' &&
        event.args.commitment.toLowerCase() === reconstructed.toLowerCase(),
    ),
    'Reconstructed commitment does not match a CommitmentMade event from this registrar.',
  )
  return reconstructed
}

const HELP = `Read-only referrer QA (run from repository root):
  pnpm --filter @ens-apps/e2e exec tsx scripts/referrer-qa.ts \\
    --chain-id 11155111 --contract 0x... --tx 0x... \\
    --kind registration --names alice.eth --referrer 0x1234

Required: --chain-id, --contract, --tx, --kind registration|renewal, --names
Optional: --referrer (omit to expect zero), --commit-tx (also verify commitment),
          --trace-file (saved callTracer result for nested HCA registration)
RPC endpoint comes only from QA_RPC_URL. No wallet or app .env is loaded.
Receipt events work for EOA and HCA. --commit-tx needs direct register calldata
or a callTracer trace. --trace-file is accepted only with --commit-tx.
Exit 0 = all requested checks passed; exit 1 = failed or could not verify.`

interface Options {
  readonly chainId: bigint
  readonly contract: Address
  readonly transactionHash: Hex
  readonly kind: Kind
  readonly names: readonly string[]
  readonly expected: Hex
  readonly commitTx?: Hex
  readonly traceFile?: string
}

function parseOptions(args: readonly string[]): Options | undefined {
  const { values } = parseArgs({
    args: [...args],
    options: {
      help: { type: 'boolean' },
      'chain-id': { type: 'string' },
      contract: { type: 'string' },
      tx: { type: 'string' },
      kind: { type: 'string' },
      names: { type: 'string' },
      referrer: { type: 'string' },
      'commit-tx': { type: 'string' },
      'trace-file': { type: 'string' },
    },
  })
  if (values.help) {
    console.log(HELP)
    return undefined
  }
  requireCheck(
    values['chain-id'] && /^\d+$/.test(values['chain-id']),
    'Supply --chain-id as a decimal network chain ID.',
  )
  requireCheck(
    values.contract && isAddress(values.contract),
    'Supply the registrar/renewer address with --contract.',
  )
  requireCheck(
    values.kind === 'registration' || values.kind === 'renewal',
    'Supply --kind registration or renewal.',
  )
  requireCheck(
    values.names,
    'Supply --names alice.eth or --names alice.eth,bob.eth.',
  )
  requireCheck(
    !values['trace-file'] || values['commit-tx'],
    '--trace-file requires --commit-tx.',
  )
  requireCheck(
    !values['commit-tx'] || values.kind === 'registration',
    '--commit-tx applies only to registration.',
  )
  return {
    chainId: BigInt(values['chain-id']),
    contract: values.contract,
    transactionHash: hash(values.tx),
    kind: values.kind,
    names: values.names.split(',').map((name) => name.trim()),
    expected: expectedReferrer(values.referrer),
    commitTx: values['commit-tx'] ? hash(values['commit-tx']) : undefined,
    traceFile: values['trace-file'],
  }
}
function createRpc(endpoint: string): Rpc {
  return async (method, params) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(30_000),
    })
    requireCheck(response.ok, `RPC ${method} returned HTTP ${response.status}.`)
    const body: unknown = await response.json()
    requireCheck(
      isRecord(body) && !body.error && 'result' in body,
      `RPC ${method} failed. Check endpoint support and network; for tracing, use --trace-file if necessary.`,
    )
    return body.result
  }
}
async function checkCommitment(
  rpc: Rpc,
  confirmed: Receipt,
  options: Options,
): Promise<void> {
  const { names, contract, expected, commitTx, transactionHash, traceFile } =
    options
  if (!commitTx) return
  requireCheck(
    names.length === 1,
    'Commitment verification requires exactly one name.',
  )
  const commit = receipt(await rpc('eth_getTransactionReceipt', [commitTx]))
  const transaction = await rpc('eth_getTransactionByHash', [transactionHash])
  requireCheck(isRecord(transaction), 'Reveal transaction not found.')
  let inputs: readonly Hex[]
  if (
    typeof transaction.to === 'string' &&
    transaction.to.toLowerCase() === contract.toLowerCase() &&
    isHex(transaction.input)
  ) {
    inputs = [transaction.input]
  } else {
    const raw: unknown = traceFile
      ? JSON.parse(await readFile(traceFile, 'utf8'))
      : await rpc('debug_traceTransaction', [
          transactionHash,
          { tracer: 'callTracer' },
        ])
    const trace = isRecord(raw) && 'result' in raw ? raw.result : raw
    inputs = registrationInputs(trace, contract)
  }
  requireCheck(
    inputs.length === 1 && inputs[0],
    'Expected exactly one successful nested register call to the specified registrar.',
  )
  const commitment = await verifyCommitment({
    rpc,
    reveal: confirmed,
    commit,
    contract,
    input: inputs[0],
    name: names[0],
    expected,
  })
  console.log(`Commitment matches: ${commitment}`)
}

export async function main(args: readonly string[]): Promise<void> {
  const options = parseOptions(args)
  if (!options) return
  const endpoint = process.env.QA_RPC_URL
  requireCheck(
    endpoint,
    'Set QA_RPC_URL to a read-only RPC endpoint for the tested network.',
  )
  const rpc = createRpc(endpoint)
  const chainId = await rpc('eth_chainId', [])
  requireCheck(
    isQuantity(chainId) && BigInt(chainId) === options.chainId,
    'RPC chain ID does not match --chain-id.',
  )
  const confirmed = receipt(
    await rpc('eth_getTransactionReceipt', [options.transactionHash]),
  )
  const verified = verifyRecordedReferrers({ logs: confirmed.logs, ...options })
  console.log(
    `Verified successful receipt on chain ${options.chainId}, contract ${options.contract}.`,
  )
  for (const row of verified) console.log(`Recorded event: ${row}`)
  await checkCommitment(rpc, confirmed, options)
  console.log('PASS: all requested checks passed.')
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    // Never print provider errors: they can contain the credential-bearing RPC URL.
    console.error(
      `FAIL: ${error instanceof VerificationError ? error.message : 'RPC, trace, or ABI decoding failed. Check the network and input format; endpoint details are hidden.'}`,
    )
    process.exitCode = 1
  })
}
