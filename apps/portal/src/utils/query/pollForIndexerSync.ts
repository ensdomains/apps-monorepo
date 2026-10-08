import { sleep } from '@ens-apps/utils/sleep'
import { getBlockNumber } from 'viem/actions'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { safeGetClient } from '@/lib/wagmi/helpers'

/**
 * Configuration for indexer sync polling.
 */
export type IndexerSyncConfig = {
  /** Delay before the first status check (ms) */
  initialDelay: number
  /** Interval between status checks (ms) */
  retryInterval: number
  /** Maximum number of status checks before refetching anyway */
  maxAttempts: number
  /** Longest the whole wait may take, however slow each check is (ms) */
  maxWait: number
}

/**
 * Default configuration for indexer sync polling: a status check every 2s for
 * up to a minute.
 */
export const DEFAULT_INDEXER_SYNC_CONFIG: IndexerSyncConfig = {
  initialDelay: 1000,
  retryInterval: 2000,
  maxAttempts: 30,
  maxWait: 60_000,
}

/**
 * Parameters for pollForIndexerSync function.
 */
export type PollForIndexerSyncParams = {
  /** Function to invalidate queries */
  invalidateQueries: () => Promise<void>
  /**
   * Block the write landed in (the receipt's `blockNumber`). Omitted, the chain
   * head at call time stands in for it: the write is mined by then, so the
   * head is at or past its block.
   */
  blockNumber?: bigint | number
  /** Optional callback for each status check (for logging) */
  onAttempt?: (attempt: number, maxAttempts: number) => void
  /** Configuration override */
  config?: Partial<IndexerSyncConfig>
}

const readHeadBlock = async (): Promise<bigint | undefined> => {
  const client = safeGetClient()
  if (client.isErr()) return undefined
  return getBlockNumber(client.value).catch(() => undefined)
}

/** bigname's indexed block for the app chain, or `undefined` if it can't say. */
const readIndexedBlock = async (): Promise<bigint | undefined> => {
  const status = await bigname.status()
  const indexed = status.isOk()
    ? status.value.data.chains[String(envConfig.chain.id)]?.indexed_block
    : undefined
  return indexed == null ? undefined : BigInt(indexed)
}

/**
 * Refresh indexed reads after a blockchain transaction, once bigname has
 * indexed the transaction's block.
 *
 * Polls `GET /v1/status` until the app chain's `indexed_block` reaches the
 * write's block, then invalidates once. The wait is bounded: after
 * `maxAttempts` checks or `maxWait` (or when the target block can't be read) it invalidates
 * anyway, so the screen shows whatever bigname has.
 *
 * @example
 * ```ts
 * await pollForIndexerSync({
 *   invalidateQueries: () => queryClient.invalidateQueries({ queryKey }),
 *   blockNumber: receipt.blockNumber,
 * })
 * ```
 */
export async function pollForIndexerSync(
  params: PollForIndexerSyncParams,
): Promise<void> {
  const { invalidateQueries, onAttempt, config = {} } = params

  const { initialDelay, retryInterval, maxAttempts, maxWait } = {
    ...DEFAULT_INDEXER_SYNC_CONFIG,
    ...config,
  }

  const target =
    params.blockNumber !== undefined
      ? BigInt(params.blockNumber)
      : await readHeadBlock()

  if (target !== undefined) {
    const deadline = Date.now() + maxWait
    await sleep(initialDelay)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onAttempt?.(attempt, maxAttempts)
      const indexed = await readIndexedBlock()
      if (indexed !== undefined && indexed >= target) break
      if (attempt === maxAttempts || Date.now() + retryInterval >= deadline)
        break
      await sleep(retryInterval)
    }
  }

  await invalidateQueries()
}
