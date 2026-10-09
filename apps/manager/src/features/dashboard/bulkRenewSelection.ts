import type { BulkRenewName } from '@/features/bulk-renew'
import { isRenewableV2EthName } from '@/features/grace/utils/gracePeriod'
import { resolveRenewalLabel } from '@/features/renew/utils/renewableName'
import { toDateFromSeconds } from './utils'

export type SelectableDomain = {
  readonly name: string | null
  /** Seconds since the epoch, as the chain stores it. */
  readonly expiryDate: bigint | null
}

/** A listed name; an expiry of `0n` never expires. */
export const toSelectableDomain = (domain: {
  readonly name: string
  readonly expiryDate: bigint
}): SelectableDomain => ({
  name: domain.name,
  expiryDate: domain.expiryDate === 0n ? null : domain.expiryDate,
})

/** The canonical key a selection is stored under. */
export const selectionKey = (domain: { readonly name: string }): string =>
  domain.name

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

  const label = resolveRenewalLabel(domain.name ?? '')
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
