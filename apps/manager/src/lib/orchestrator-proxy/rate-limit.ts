/**
 * Per-account sponsorship rate limiting for the orchestrator proxy, backed by
 * Workers KV.
 *
 * The limit is semantic — "max N sponsored transactions per account per
 * minute" — so it is only consumed for requests that actually carry sponsored
 * calls (see handler.ts), not for every orchestrator HTTP request (status
 * polling, etc.).
 *
 * Why KV (and not a Durable Object): a DO would give exact, strongly
 * consistent counts, but it requires a migration, which cannot be applied
 * through the manager's gradual (`wrangler versions upload`) deploy pipeline.
 * KV needs no migration and works with versioned deploys.
 *
 * Implementation note: KV throttles writes to a *single* key to 1/sec, which a
 * burst of sponsorships would exceed. To avoid that, each sponsorship writes
 * its own unique, 60s-TTL key under a per-account prefix, and the limit is
 * enforced by counting keys in that prefix via `list`. Consequences:
 *   - `list` is eventually consistent, so the cap is approximate and may
 *     slightly overshoot under concurrent bursts across locations. Acceptable
 *     for an abuse-cost guard (the allowlist already constrains *what* can be
 *     sponsored).
 *   - We fail OPEN on KV errors: a KV blip should not block legitimate
 *     registrations, and the allowlist remains the hard security boundary.
 */

import type { Address } from 'viem'

export const SPONSOR_RATE_LIMIT = 30
const WINDOW_TTL_SECONDS = 60
const KEY_PREFIX = 'ratelimit:sponsor:'

/**
 * Reserve one sponsorship slot for `account`. Returns whether the request is
 * within the limit. Counts existing slots in the current window and, if under
 * the limit, records a new unique slot key (auto-expiring after 60s).
 */
export async function reserveSponsorship(
  kv: KVNamespace,
  account: Address,
): Promise<{ allowed: boolean; count: number }> {
  const prefix = `${KEY_PREFIX}${account}:`

  try {
    // `list` caps at 1000 keys/page; the limit is far below that, so a single
    // page is enough to count the window.
    const { keys } = await kv.list({ prefix })
    const count = keys.length

    if (count >= SPONSOR_RATE_LIMIT) {
      return { allowed: false, count }
    }

    const slotKey = `${prefix}${Date.now()}-${crypto.randomUUID()}`
    await kv.put(slotKey, '', { expirationTtl: WINDOW_TTL_SECONDS })

    return { allowed: true, count: count + 1 }
  } catch (error) {
    // Fail open — see module doc.
    console.error('[orchestrator-proxy] KV rate-limit error, allowing:', error)
    return { allowed: true, count: 0 }
  }
}
