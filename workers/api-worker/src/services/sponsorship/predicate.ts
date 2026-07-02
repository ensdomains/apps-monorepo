import type { SponsorshipFilter } from '@rhinestone/sdk/jwt-server'
import { logger } from '#utils/logger.js'
import { resolveAllowlist, validateCalls } from './allowlist'

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
 * `chain` enforces the sponsorable-chain allowlist and `calls` enforces the
 * ENS-only contract + function-selector allowlist (FET-3337, structural gate —
 * see ./allowlist). `account` stays permissive: sponsorship is gated per *name*,
 * not per caller identity. The remaining, semantic half of FET-3337 — decode the
 * calls, then re-derive `floor(5 × years) − spent` for the name and the global
 * 40k budget from the Bigname `gas_sponsorship` projection at decision time —
 * layers on top of this and is not yet implemented. It must always re-derive
 * from the projection, never read a mutable counter.
 *
 * Returns Rhinestone's `SponsorshipFilter`, i.e. the value passed as the SDK's
 * `shouldSponsor` config key. "Predicate" is our (and the design doc's) name for it.
 */
/**
 * Default sponsorable chains when `RHINESTONE_SPONSORSHIP_CHAIN_IDS` is unset —
 * Sepolia only. Mainnet is deliberately excluded; opting it in is a deliberate
 * change (set the env var, or extend this default) gated by FET-3337.
 */
const DEFAULT_SPONSORSHIP_CHAIN_IDS = '11155111'

export function createSponsorshipPredicate(
  env: CloudflareBindings,
): SponsorshipFilter {
  // `??` (not `||`): an *unset* var takes the Sepolia default, but an explicit
  // blank/empty value is honoured as a deliberate deny-all off-switch.
  const chainIds = parseSponsorshipChainIds(
    env.RHINESTONE_SPONSORSHIP_CHAIN_IDS ?? DEFAULT_SPONSORSHIP_CHAIN_IDS,
  )
  if (chainIds.size === 0) {
    // Reached only if the allowlist was explicitly set to a value with no valid
    // chain ids (an unset var uses the Sepolia default above) — surface the
    // resulting deny-all so it is not mistaken for silent breakage.
    logger.warn(
      'Sponsorship chain allowlist is empty; every chain will be denied. ' +
        'RHINESTONE_SPONSORSHIP_CHAIN_IDS is set but has no valid chain ids.',
    )
  }
  // Derived once here (from the static per-chain allowlists in ./allowlist),
  // not per call. `calls` then closes over it as a pure, synchronous check.
  const allowlist = resolveAllowlist(chainIds)
  return {
    chain: ({ id }) => chainIds.has(id),
    // Per-name allowance + global 40k budget (re-derived from the Bigname
    // gas_sponsorship projection) is the remaining semantic gate — see the
    // predicate docstring; it layers on top of the structural allowlist below.
    account: () => true,
    calls: (calls) => validateCalls(calls, allowlist).ok,
  }
}
