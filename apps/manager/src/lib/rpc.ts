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
        // Workerd isolates must not retain HTTP batch promises between SSR
        // requests. The browser has one request context and can batch safely.
        batch:
          typeof window === 'undefined' ? false : { batchSize: 20, wait: 16 },
      }),
    ),
    // One more pass over the endpoints; viem gives each endpoint no retries of its own.
    { rank: false, retryCount: 1 },
  )
