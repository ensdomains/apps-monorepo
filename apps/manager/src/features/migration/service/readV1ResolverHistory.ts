import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, ResultAsync } from 'neverthrow'
import * as v from 'valibot'
import { type Hex, type PublicClient, toHex, withRetry } from 'viem'
import { checkNotAborted } from './bignameLookup'
import { hasSubnameLogRangeLimit } from './rpcSubnameInventory'
import type { V1ProfileSource } from './v1ProfileKeys'
import {
  parseResolverHistory,
  planResolverHistory,
  RESOLVER_HISTORY_TOPICS,
  type ResolverHistoryRecord,
  shouldRetryResolverHistoryRead,
  splitResolverHistoryRequest,
} from './v1ResolverHistory'

class ReadV1ResolverHistoryError extends TaggedError(
  'ReadV1ResolverHistoryError',
)<{
  readonly cause: unknown
}> {}

const CONCURRENT_REQUESTS = 8
const LOG_RETRY_COUNT = 2
const hashSchema = v.custom<Hex>(
  (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value),
)
const blockSchema = v.object({
  number: v.pipe(
    v.string(),
    v.regex(/^0x[0-9a-fA-F]+$/),
    v.transform((value: string) => BigInt(value)),
  ),
  hash: hashSchema,
})

/** One RPC-only history read at a pinned block, with bounded parallel ranges. */
export const readV1ResolverHistory = ResultFn(async function* ({
  sources,
  publicClient,
  chainId,
  signal,
  verificationClient = publicClient,
}: {
  readonly sources: readonly V1ProfileSource[]
  readonly publicClient: Pick<PublicClient, 'request'>
  readonly verificationClient?: Pick<PublicClient, 'request'>
  readonly chainId: number
  readonly signal?: AbortSignal
}) {
  const toError = (cause: unknown) => new ReadV1ResolverHistoryError({ cause })
  yield* checkNotAborted(signal, toError)
  if (sources.length === 0) return ok<readonly ResolverHistoryRecord[]>([])
  const readBlock = (block: Hex | 'latest', client = publicClient) =>
    ResultAsync.fromPromise(
      client.request(
        { method: 'eth_getBlockByNumber', params: [block, false] },
        { signal },
      ),
      toError,
    ).andThen((response) => {
      const parsed = v.safeParse(blockSchema, response)
      return parsed.success
        ? ok(parsed.output)
        : err(toError(new Error('Missing resolver history checkpoint')))
    })
  const [actualChainId, checkpoint] = yield* ResultAsync.combine([
    ResultAsync.fromPromise(
      publicClient.request({ method: 'eth_chainId' }, { signal }),
      toError,
    ),
    readBlock('latest'),
  ] as const)
  yield* checkNotAborted(signal, toError)
  const parsedChainId = v.safeParse(
    v.pipe(
      v.string(),
      v.regex(/^0x[0-9a-fA-F]+$/),
      v.transform((value: string) => BigInt(value)),
    ),
    actualChainId,
  )
  if (!parsedChainId.success || parsedChainId.output !== BigInt(chainId))
    return err(
      toError(new Error('Resolver history RPC is connected to another chain')),
    )
  const requests = planResolverHistory({
    sources,
    chainId,
    toBlock: checkpoint.number,
  })
  const queue = requests.values()
  let failure: ReadV1ResolverHistoryError | undefined
  // Split children run in their parent's slot, so caps never increase concurrency.
  const readRange: (
    request: (typeof requests)[number],
  ) => ResultAsync<
    readonly ResolverHistoryRecord[],
    ReadV1ResolverHistoryError
  > = ResultFn(async function* (request) {
    yield* checkNotAborted(signal, toError)
    if (failure) return err(failure)
    const nodes = v.safeParse(
      v.array(hashSchema),
      request.sources.map(({ id }) => id),
    )
    if (!nodes.success)
      return err(toError(new Error('Invalid resolver history node')))
    const response = await ResultAsync.fromPromise(
      withRetry(
        () =>
          failure
            ? Promise.reject(failure)
            : publicClient.request(
                {
                  method: 'eth_getLogs',
                  params: [
                    {
                      address: request.resolver,
                      fromBlock: toHex(request.fromBlock),
                      toBlock: toHex(request.toBlock),
                      topics: [RESOLVER_HISTORY_TOPICS, nodes.output],
                    },
                  ],
                },
                { signal },
              ),
        {
          retryCount: LOG_RETRY_COUNT,
          delay: ({ count }) => 250 * 2 ** count,
          shouldRetry: ({ error }) =>
            !failure && shouldRetryResolverHistoryRead(error),
          signal,
        },
      ),
      toError,
    )
    yield* checkNotAborted(signal, toError)
    if (response.isOk())
      return parseResolverHistory(response.value, request).mapErr(toError)
    if (!hasSubnameLogRangeLimit(response.error.cause))
      return err(response.error)
    const partitions = splitResolverHistoryRequest(request)
    if (partitions.length === 0) return err(response.error)
    let records: readonly ResolverHistoryRecord[] = []
    for (const partition of partitions) {
      const page = yield* readRange(partition)
      records = [...records, ...page]
    }
    return ok(records)
  })
  const readNext = ResultFn(async function* () {
    let records: readonly ResolverHistoryRecord[] = []
    while (!failure) {
      yield* checkNotAborted(signal, toError)
      const next = queue.next()
      if (next.done) break
      const result = await readRange(next.value)
      if (result.isErr()) failure = result.error
      const page = yield* result
      yield* checkNotAborted(signal, toError)
      records = [...records, ...page]
    }
    return ok(records)
  })
  const records = yield* ResultAsync.combine(
    Array.from({ length: Math.min(CONCURRENT_REQUESTS, requests.length) }, () =>
      readNext(),
    ),
  )
  yield* checkNotAborted(signal, toError)
  const confirmed = yield* readBlock(
    toHex(checkpoint.number),
    verificationClient,
  )
  yield* checkNotAborted(signal, toError)
  if (
    confirmed.hash !== checkpoint.hash ||
    confirmed.number !== checkpoint.number
  )
    return err(
      toError(new Error('Resolver history checkpoint changed during the read')),
    )
  return ok(records.flat())
})
