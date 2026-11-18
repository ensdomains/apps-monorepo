import type { Address, NameSummary } from '@ens-apps/indexer/reads'
import { SECONDS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import { indexer } from '@/lib/indexer'
import { isNormalizedLabel } from '@/utils/token/isNormalized'

/**
 * How long a name the address let expire stays listed, counted from its expiry
 * (for an ENSv1 name, its registrar lease rather than its ENSv2 reservation).
 */
const LAPSED_LISTED_DAYS = 30
const LAPSED_WINDOW_MS = LAPSED_LISTED_DAYS * SECONDS_PER_DAY * 1000

const isEth2ld = (name: string): boolean => {
  const [label, tld, ...rest] = name.split('.')
  return (
    tld === 'eth' && rest.length === 0 && !!label && isNormalizedLabel(label)
  )
}

const windowStart = (now: Date) => new Date(now.getTime() - LAPSED_WINDOW_MS)

/** A `.eth` name the address let expire, for 30 days: `expired` in grace, `released` after. */
export const isLapsedName = (summary: NameSummary, now: Date): boolean =>
  (summary.registrationStatus === 'expired' ||
    summary.registrationStatus === 'released') &&
  summary.expiresAt !== null &&
  windowStart(now) < summary.expiresAt &&
  summary.expiresAt <= now &&
  isEth2ld(summary.name)

/**
 * The address's lapsed `.eth` names, in either era. The indexer drops them
 * from the current relations (an ENSv2 name at expiry, an ENSv1 one when grace
 * ends), so they come from their own read over the expiry window.
 */
export const readLapsedNames = (
  address: Address,
  now: Date,
  signal?: AbortSignal,
) =>
  indexer
    .getLapsedNames({ address, now, since: windowStart(now) }, { signal })
    .map((summaries) =>
      summaries.filter((summary) => isLapsedName(summary, now)),
    )
