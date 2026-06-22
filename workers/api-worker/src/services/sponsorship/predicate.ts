import type { SponsorshipFilter } from '@rhinestone/sdk/jwt-server'
import { logger } from '#utils/logger.js'

/**
 * Parse a comma-separated list of chain ids (e.g. `"1,11155111"`) into a Set.
 *
 * Blank and non-positive-integer entries are dropped. An empty result denies
 * every chain — the safe default: a chain must be opted in explicitly before it
 * can be sponsored.
 */
export function parseSponsorshipChainIds(
  raw: string | undefined,
): ReadonlySet<number> {
  if (!raw) return new Set<number>()
  const ids = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)
  return new Set(ids)
}

/**
 * The `shouldSponsor` predicate Rhinestone evaluates when minting an extension
 * token (AND-combined `chain` / `account` / `calls` checks).
 *
 * FET-3334 (foundation) ships the chain allowlist only. `account` and `calls`
 * are intentionally permissive stubs. The real records + primary-name predicate
 * — decode the calls, then re-derive `floor(5 × years) − spent` for the name and
 * the global 40k budget from the Bigname `gas_sponsorship` projection at
 * decision time — lands in FET-3337 and replaces these two stubs. It must always
 * re-derive from the projection, never read a mutable counter.
 *
 * Returns Rhinestone's `SponsorshipFilter`, i.e. the value passed as the SDK's
 * `shouldSponsor` config key. "Predicate" is our (and the design doc's) name for it.
 */
export function createSponsorshipPredicate(
  env: CloudflareBindings,
): SponsorshipFilter {
  const chainIds = parseSponsorshipChainIds(
    env.RHINESTONE_SPONSORSHIP_CHAIN_IDS,
  )
  if (chainIds.size === 0) {
    // Deny-all is the safe direction, but it is almost always a
    // misconfiguration (unset/blank RHINESTONE_SPONSORSHIP_CHAIN_IDS) rather
    // than intent, and it silently disables sponsorship — so surface it.
    logger.warn(
      'Sponsorship chain allowlist is empty; every chain will be denied. ' +
        'Set RHINESTONE_SPONSORSHIP_CHAIN_IDS (comma-separated chain ids) to enable sponsorship.',
    )
  }
  return {
    chain: ({ id }) => chainIds.has(id),
    // TODO(FET-3337): re-derive per-name allowance + global 40k budget from the
    // Bigname gas_sponsorship projection; decode setRecords/setPrimary calls.
    account: () => true,
    calls: () => true,
  }
}
