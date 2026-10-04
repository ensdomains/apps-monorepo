import type { BulkRenewName } from '@/features/bulk-renew'
import { isRenewableV2EthName } from '@/features/grace/utils/gracePeriod'
import { resolveRenewalLabel } from '@/features/renew/utils/renewableName'
import type { DashboardName } from './dashboardNames'
import { toDateFromSeconds } from './utils'

export type SelectableDomain = {
  readonly id: string
  readonly name?: string | null
  readonly normalizedName?: string | null
  /** Seconds since the epoch, as the chain stores it. */
  readonly expiryDate?: bigint | null
}

/**
 * A dashboard name, whose expiry is a JSON number of seconds. Widened to
 * `bigint` at this boundary, and never narrowed again.
 */
export const toSelectableDomain = (
  name: Pick<DashboardName, 'key' | 'name' | 'expiryDate'>,
): SelectableDomain => ({
  id: name.key,
  name: name.name,
  normalizedName: name.name,
  expiryDate: name.expiryDate == null ? null : BigInt(name.expiryDate),
})

/** The canonical key a selection is stored under. */
export const selectionKey = (name: Pick<DashboardName, 'name'>): string =>
  name.name

/**
 * A domain's bulk-renew payload, or `null` if it can't be renewed here. One
 * label for display and calldata, and never a stored label that isn't already
 * normalized — renewing the twin of `ALICE.eth` would extend a name the user
 * doesn't own, at their expense.
 */
export const toBulkRenewName = (
  domain: SelectableDomain,
): BulkRenewName | null => {
  if (domain.expiryDate == null) return null

  // Never the `id` (a namehash): it isn't a name.
  const label = resolveRenewalLabel(domain.name ?? domain.normalizedName ?? '')
  if (label.isErr()) return null

  const name = `${label.value}.eth`
  if (
    !isRenewableV2EthName(name, toDateFromSeconds(Number(domain.expiryDate)))
  ) {
    return null
  }

  return {
    displayName: name,
    label: label.value,
    name,
    currentExpiry: domain.expiryDate,
  }
}
