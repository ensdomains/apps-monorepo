import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { type GetBlockErrorType, getBlock } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetBlockTimestampsError extends TaggedError(
  'GetBlockTimestampsError',
)<{
  cause: GetBlockErrorType
}> { }

type GetBlockTimestampsParameters = {
  blocks: bigint[]
}

export const getBlockTimestamps = ResultFn(async function* (
  { blocks }: GetBlockTimestampsParameters,
) {
  const client = yield* safeGetClient()

  const uniqueBlocks = [...new Set(blocks)]

  const result = yield* fromPromise(
    Promise.all(
      uniqueBlocks.map(async (blockNumber) => {
        const block = await getBlock(client, { blockNumber })
        return { blockNumber, timestamp: block.timestamp }
      })
    ),
    (e) => new GetBlockTimestampsError({ cause: e as GetBlockErrorType })
  )

  const timestamps = new Map<bigint, bigint>()
  for (const { blockNumber, timestamp } of result) {
    timestamps.set(blockNumber, timestamp)
  }

  return ok(timestamps)
})


export const getBlockTimestampsQueryKey = createQueryKey<
  'getBlockTimestampsQueryKey',
  GetBlockTimestampsParameters
>('getBlockTimestampsQueryKey')

export const getBlockTimestampsQueryOptions = (
  params: GetBlockTimestampsParameters,
) => resultQueryOptions({
  queryKey: getBlockTimestampsQueryKey(params),
  queryFn: ({ queryKey: [, params] }) => getBlockTimestamps(params),
})

export const useBlockTimestamps = (
  params: GetBlockTimestampsParameters,
) => useQuery(getBlockTimestampsQueryOptions(params))