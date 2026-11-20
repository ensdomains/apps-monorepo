import { TaggedError } from '@ens-apps/utils/neverthrow'
import { ResultAsync } from 'neverthrow'
import type { Client } from 'viem'
import { type GetBlockErrorType, getBlock } from 'viem/actions'
import { IndexerReadError } from '../reads/errors'

export class GetBlockTimestampsError extends TaggedError(
  'GetBlockTimestampsError',
)<{ cause: GetBlockErrorType }> {}

/** Unix seconds per block; with a batching transport the reads go out as one JSON-RPC batch. */
export const readBlockTimestamps = (
  client: Client,
  blocks: readonly number[],
): ResultAsync<ReadonlyMap<number, bigint>, IndexerReadError> =>
  ResultAsync.fromPromise(
    Promise.all(
      [...new Set(blocks)].map(async (block) => {
        const { timestamp } = await getBlock(client, {
          blockNumber: BigInt(block),
        })
        return [block, timestamp] as const
      }),
    ),
    (cause) =>
      new IndexerReadError({
        kind: 'unavailable',
        message: 'Block timestamps could not be read',
        cause: new GetBlockTimestampsError({
          message: 'getBlock failed',
          cause: cause as GetBlockErrorType,
        }),
      }),
  ).map((entries): ReadonlyMap<number, bigint> => new Map(entries))
