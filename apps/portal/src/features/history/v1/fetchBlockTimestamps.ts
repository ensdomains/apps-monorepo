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
 * Rejects if any block fails to load. Tolerating a partial map would mean
 * dating those events to the epoch — sorted to the bottom of the timeline and
 * rendered as Jan 1 1970 — which reads as real history rather than as a
 * failure. The caller degrades to "v1 unavailable" instead.
 */
export const fetchBlockTimestamps = async (
  client: Client<Transport, typeof sepoliaWithEns>,
  blockNumbers: readonly number[],
): Promise<Map<number, number>> =>
  new Map(
    await Promise.all(
      blockNumbers.map(async (blockNumber) => {
        const block = await getBlock(client, {
          blockNumber: BigInt(blockNumber),
          includeTransactions: false,
        })
        return [blockNumber, Number(block.timestamp)] as const
      }),
    ),
  )
