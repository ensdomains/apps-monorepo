import type { RowSelectionState } from '@tanstack/react-table'
import type { NameRow } from '@/features/names/components/NamesTable/columns'
import type { SelectedName } from '@/features/renew/hooks/useRenewalTransactions'
import { isCanonicalName, isNormalizedLabel } from '@/utils/token/isNormalized'

export const MS_PER_SECOND = 1000
export const MS_PER_DAY = 24 * 60 * 60 * MS_PER_SECOND
export const GRACE_PERIOD_DAYS = 90
export const V2_GRACE_PERIOD_DAYS = 28
export const PREMIUM_PERIOD_DAYS = 21

/** A row's selection key: its name, not its position, which shifts as rows load. */
export const getNameRowId = (row: NameRow, index: number): string =>
  row.name === null ? String(index) : `${row.protocolVersion}:${row.name}`

export const getSelectedNames = (
  rowSelection: RowSelectionState,
  filteredData: NameRow[],
): readonly SelectedName[] =>
  filteredData
    .filter((row, index) => rowSelection[getNameRowId(row, index)])
    .filter((row): row is NameRow & { name: string } => row.name !== null)
    .map((row) => ({
      name: row.name,
      isV2: row.protocolVersion === 'ENSv2',
      expiryDate: row.expiryDate,
    }))

export const getNameStatus = (
  expiryDate: Date | null | undefined,
  isV2 = false,
): string => {
  if (!expiryDate) return 'no-expiry'
  const now = new Date()
  const graceDays = isV2 ? V2_GRACE_PERIOD_DAYS : GRACE_PERIOD_DAYS
  const gracePeriodEnd = new Date(expiryDate.getTime() + graceDays * MS_PER_DAY)
  if (isV2) {
    if (now > gracePeriodEnd) return 'expired'
    if (now > expiryDate) return 'grace'
    return 'registered'
  }
  const premiumPeriodEnd = new Date(
    gracePeriodEnd.getTime() + PREMIUM_PERIOD_DAYS * MS_PER_DAY,
  )
  if (now > premiumPeriodEnd) return 'expired'
  if (now > gracePeriodEnd) return 'premium'
  if (now > expiryDate) return 'grace'
  return 'registered'
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

// Coarse client-side pre-filter for the Extend flow: a `.eth` 2LD still within
// its grace window (v2: 28d, v1: 90d after expiry). NOT the authoritative gate —
// v1 renewability is decided by the renewer's on-chain `isRenewable` in
// useCanExtend; this just avoids pricing an obviously past-grace name.
//
// Shared by both entry points into the flow — the name page's Extend button
// (via useCanExtend) and the names table's multi-select — so the non-canonical
// refusal below covers both at once.
export const isExtendable2LD = ({
  name,
  isV2,
  expiryDate,
}: SelectedName): boolean => {
  // The renew call takes a *label*, and every step derives it with `getLabel`,
  // which normalises: offering Extend on `ALICE.eth` would renew `alice.eth` —
  // a different name, possibly someone else's. Both spellings are registrable,
  // so this isn't a display quirk. Refused here rather than silently renewing
  // the canonical twin; `buildRenewIntent` repeats the check at signing time.
  if (!isCanonicalName(name)) return false
  if (!ETH_2LD_RE.test(name)) return false
  // When expiry isn't known yet (indexer loading/error), gate v2 conservatively
  // so we never price a past-grace name. v1 stays permissive here because
  // useCanExtend additionally gates it on the renewer's on-chain `isRenewable`.
  if (!expiryDate) return !isV2
  const graceDays = isV2 ? V2_GRACE_PERIOD_DAYS : GRACE_PERIOD_DAYS
  const cutoff = expiryDate.getTime() + graceDays * MS_PER_DAY
  return cutoff > Date.now()
}
