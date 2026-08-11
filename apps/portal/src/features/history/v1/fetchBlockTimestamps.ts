import type { Client, Transport } from 'viem'
import { getBlock } from 'viem/actions'
import type { sepoliaWithEns } from '@/lib/wagmi'

/**
 * Resolve `blockNumber → unix seconds` for the given blocks.
 *
 * The v1 subgraph exposes `blockNumber` but no timestamp, while the timeline
 * sorts, groups and date-formats entirely on `timestamp` — so v1 events have to
 * be backfilled over RPC. Blocks are deduped by the caller's `Set`, and a name's
 * history usually touches only a handful of them; the transport batches the
 * resulting `eth_getBlockByNumber` calls.
 *
 * A block that fails to load is simply absent from the map rather than failing
 * the whole history — `adaptV1Events` falls back to 0 for it.
 */
export const fetchBlockTimestamps = async (
  client: Client<Transport, typeof sepoliaWithEns>,
  blockNumbers: readonly number[],
): Promise<Map<number, number>> => {
  const results = await Promise.allSettled(
    blockNumbers.map(async (blockNumber) => {
      const block = await getBlock(client, {
        blockNumber: BigInt(blockNumber),
        includeTransactions: false,
      })
      return [blockNumber, Number(block.timestamp)] as const
    }),
  )

  const timestamps = new Map<number, number>()
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const [blockNumber, timestamp] = result.value
      timestamps.set(blockNumber, timestamp)
    }
  }
  return timestamps
}
