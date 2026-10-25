import { fallback, http } from 'viem'

/**
 * Failover across the app's attributed primary and the network's shared
 * public endpoints. `rank: false` keeps the declared order (primary first)
 * instead of latency ranking, which would let a fast public node steal
 * traffic from our key.
 */
export const failover = (urls: readonly string[]) =>
  fallback(
    urls.map((url) =>
      http(url, {
        retryCount: 2,
        batch: { batchSize: 20, wait: 16 },
      }),
    ),
    { rank: false, retryCount: 2 },
  )
