import type { BulkRenewName } from '@/features/bulk-renew'
import { isRenewableV2EthName } from '@/features/grace/utils/gracePeriod'
import { resolveRenewalLabel } from '@/features/renew/utils/renewableName'
import { resolveDomainLabel, toDateFromSeconds } from './utils'

type DomainLabels = {
  readonly id: string
  readonly name?: string | null
  readonly normalizedName?: string | null
}

export type SelectableDomain = DomainLabels & {
  /** Seconds since the epoch, as the chain stores it. */
  readonly expiryDate?: bigint | null
}

/**
 * A domain as the indexer returns it, where the expiry is a JSON number.
 * Widened to `bigint` at this boundary, and never narrowed again.
 */
export const toSelectableDomain = (
  domain: DomainLabels & { readonly expiryDate?: number | null },
): SelectableDomain => ({
  ...domain,
  expiryDate: domain.expiryDate == null ? null : BigInt(domain.expiryDate),
})

/** The canonical key a selection is stored under. */
export const selectionKey = (domain: DomainLabels): string =>
  resolveDomainLabel(domain)

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
