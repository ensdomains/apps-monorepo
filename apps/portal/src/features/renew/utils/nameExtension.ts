import type { NameRegistrationStatus } from '@ens-apps/indexer/reads'
import type { SelectedName } from '@/features/renew/hooks/useRenewalTransactions'
import { isCanonicalName, isNormalizedLabel } from '@/utils/token/isNormalized'

export const MS_PER_SECOND = 1000
export const MS_PER_DAY = 24 * 60 * 60 * MS_PER_SECOND
export const PREMIUM_PERIOD_DAYS = 21

export type NameStatusInput = {
  readonly expiryDate?: Date | null
  readonly parentExpiryDate?: Date | null
  readonly graceEndDate: Date | null
  readonly status: NameRegistrationStatus
}

/**
 * bigname's `status` decides whether a name lapsed, so a wrapped ENSv1 subname
 * it still serves as active is not shown past its wrapper expiry.
 */
export const getNameStatus = (
  { expiryDate, parentExpiryDate, graceEndDate, status }: NameStatusInput,
  now = new Date(),
): string => {
  if (!expiryDate)
    return parentExpiryDate === undefined ? 'no-expiry' : 'expires-with-parent'
  if (status !== 'expired' && status !== 'released') return 'registered'
  if (!graceEndDate) return 'expired'
  if (now < graceEndDate) return 'grace'
  const premiumEnd = graceEndDate.getTime() + PREMIUM_PERIOD_DAYS * MS_PER_DAY
  return now.getTime() < premiumEnd ? 'premium' : 'expired'
}

export const getNameLength = (name: string | null): string => {
  if (!name) return '5+'
  const label = name.split('.')[0]
  // Codepoint count to match the contract's StringUtils.strlen, not UTF-16
  // code units — see getBaseRateForName.
  const length = [...label].length
  if (length === 3 || length === 4) return String(length)
  return '5+'
}

const ETH_2LD_RE = /^[^.]+\.eth$/

// A stored label that is not its own normalised form is a different
// registration from its twin; `getLabel` would renew the twin.
export const isNonCanonicalEthName = (name: string): boolean =>
  ETH_2LD_RE.test(name) && !isNormalizedLabel(name.split('.')[0] ?? '')

// Coarse client-side pre-filter for the Extend flow: a `.eth` 2LD whose grace
// has not ended. NOT the authoritative gate —
// v1 renewability is decided by the renewer's on-chain `isRenewable` in
// useCanExtend; this just avoids pricing an obviously past-grace name.
//
// Shared by both entry points into the flow — the name page's Extend button
// (via useCanExtend) and the names table's multi-select — so the non-canonical
// refusal below covers both at once.
export const isExtendable2LD = ({
  name,
  isV2,
  graceEndDate,
}: SelectedName): boolean => {
  // The renew call takes a *label*, and every step derives it with `getLabel`,
  // which normalises: offering Extend on `ALICE.eth` would renew `alice.eth` —
  // a different name, possibly someone else's. Both spellings are registrable,
  // so this isn't a display quirk. Refused here rather than silently renewing
  // the canonical twin; `buildRenewIntent` repeats the check at signing time.
  if (!isCanonicalName(name)) return false
  if (!ETH_2LD_RE.test(name)) return false
  // When grace isn't known yet (indexer loading/error), gate v2 conservatively
  // so we never price a past-grace name. v1 stays permissive here because
  // useCanExtend additionally gates it on the renewer's on-chain `isRenewable`.
  if (!graceEndDate) return !isV2
  return graceEndDate.getTime() > Date.now()
}
