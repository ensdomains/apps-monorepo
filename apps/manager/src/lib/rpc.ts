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
        batch: { batchSize: 20, wait: 16 },
      }),
    ),
    // One more pass over the endpoints; viem gives each endpoint no retries of its own.
    { rank: false, retryCount: 1 },
  )
