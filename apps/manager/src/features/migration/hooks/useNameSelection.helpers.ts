import type { V1Domain } from '@ens-apps/migration'

export const hasManagerRestorationAfterRenewal = (
  domain: V1Domain,
  nowSeconds: bigint,
): boolean => {
  const registrantId = domain.registrant?.id.toLowerCase()
  if (!registrantId) return false

  // Match classification's active-wrapper check: stale wrapper data can remain
  // on a registration that has reverted to its registrant.
  const hasActiveWrapper =
    domain.wrappedDomain !== null &&
    (BigInt(domain.wrappedDomain.expiryDate) > nowSeconds ||
      domain.wrappedOwner?.id.toLowerCase() === registrantId)

  return !hasActiveWrapper && domain.owner.id.toLowerCase() !== registrantId
}
