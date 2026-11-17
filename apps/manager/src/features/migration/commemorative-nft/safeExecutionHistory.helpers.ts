export const SAFE_HISTORY_LOG_BLOCKS = 10_000n
export const SAFE_HISTORY_LOG_REQUESTS = 24
const SAFE_HISTORY_REORG_OVERLAP = 100n

export type CommemorativeNftSafeHistoryPage = {
  readonly kind: 'recent' | 'contiguous'
  readonly fromBlock: bigint
  readonly toBlock: bigint
}

export const getCommemorativeNftSafeHistoryPages = (params: {
  readonly searchFromBlock: bigint
  readonly latestBlock: bigint
}): readonly CommemorativeNftSafeHistoryPage[] => {
  const recentFromBlock =
    params.latestBlock >= SAFE_HISTORY_LOG_BLOCKS
      ? params.latestBlock - SAFE_HISTORY_LOG_BLOCKS + 1n
      : 0n
  const recentPage: CommemorativeNftSafeHistoryPage = {
    kind: params.searchFromBlock >= recentFromBlock ? 'contiguous' : 'recent',
    fromBlock: recentFromBlock,
    toBlock: params.latestBlock,
  }
  const historyPages = Array.from(
    { length: SAFE_HISTORY_LOG_REQUESTS - 1 },
    (_, index): CommemorativeNftSafeHistoryPage => {
      const fromBlock =
        params.searchFromBlock + BigInt(index) * SAFE_HISTORY_LOG_BLOCKS
      return {
        kind: 'contiguous',
        fromBlock,
        toBlock:
          fromBlock + SAFE_HISTORY_LOG_BLOCKS < recentFromBlock
            ? fromBlock + SAFE_HISTORY_LOG_BLOCKS - 1n
            : recentFromBlock - 1n,
      }
    },
  ).filter(({ fromBlock }) => fromBlock < recentFromBlock)
  return [recentPage, ...historyPages]
}

export const getCommemorativeNftSafeHistoryCheckpoint = (params: {
  readonly page: CommemorativeNftSafeHistoryPage
  readonly searchFromBlock: bigint
}): bigint | undefined => {
  if (params.page.kind === 'recent') return undefined
  const nextBlock = params.page.toBlock + 1n - SAFE_HISTORY_REORG_OVERLAP
  return nextBlock > params.searchFromBlock ? nextBlock : params.searchFromBlock
}
