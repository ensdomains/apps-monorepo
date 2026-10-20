import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { type GetBlockErrorType, getBlock } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetBlockTimestampsError extends TaggedError('GetBlockTimestampsError')<{
  cause: GetBlockErrorType
}> {}

type GetBlockTimestampsParameters = {
  blocks: bigint[]
}

/** Block timestamps over RPC, for role history read from chain logs. */
export const getBlockTimestamps = ResultFn(async function* ({
  blocks,
}: GetBlockTimestampsParameters) {
  const client = yield* safeGetClient()

  const uniqueBlocks = [...new Set(blocks)]

  const result = yield* fromPromise(
    Promise.all(
      uniqueBlocks.map(async (blockNumber) => {
        const block = await getBlock(client, { blockNumber })
        return [blockNumber, block.timestamp] as const
      }),
    ),
    (e) => new GetBlockTimestampsError({ cause: e as GetBlockErrorType }),
  )

  return ok(new Map(result))
})
