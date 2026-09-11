import type { BulkRenewName } from '@/features/bulk-renew'
import { isRenewableV2EthName } from '@/features/grace/utils/gracePeriod'
import { resolveRenewalLabel } from '@/features/renew/utils/renewableName'
import { resolveDomainLabel, toDateFromSeconds } from './utils'

export type SelectableDomain = {
  readonly id: string
  readonly name?: string | null
  readonly normalizedName?: string | null
  readonly expiryDate?: number | null
}

/** The canonical key a selection is stored under. */
export const selectionKey = (domain: SelectableDomain): string =>
  resolveDomainLabel(domain).toLowerCase()

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

  // Not `resolveDomainLabel` — its `id` fallback isn't a name.
  const label = resolveRenewalLabel(domain.name ?? domain.normalizedName ?? '')
  if (label.isErr()) return null

  const name = `${label.value}.eth`
  if (!isRenewableV2EthName(name, toDateFromSeconds(domain.expiryDate))) {
    return null
  }

  return {
    displayName: name,
    label: label.value,
    name,
    currentExpiry: BigInt(domain.expiryDate),
  }
}
