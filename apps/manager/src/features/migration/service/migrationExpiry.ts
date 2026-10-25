import type { DirectClassifiedName } from './classifyNames'

// ETHRenewerV1 uses 62 days plus one second; the initial premigration used
// exactly 62 days. Controllers preserve the actual reservation in either case.
export const MIGRATION_EXPIRY_BONUS_SECONDS = 62n * 24n * 60n * 60n + 1n
const V1_GRACE_PERIOD_SECONDS = 90n * 24n * 60n * 60n

/** Exact expiry the deployed direct migration route must preserve. */
export const directMigrationExpiry = (
  name: DirectClassifiedName,
  reservedExpiry?: bigint,
): bigint => {
  if (
    name.tokenType === 'locked-child' ||
    name.tokenType === 'detached-child'
  ) {
    const expiry = name.domain.wrappedDomain?.expiryDate
    if (expiry !== undefined) return BigInt(expiry)
  } else {
    if (reservedExpiry !== undefined) return reservedExpiry
    const expiry = name.domain.registration?.expiryDate
    if (expiry !== undefined)
      return BigInt(expiry) + MIGRATION_EXPIRY_BONUS_SECONDS
    const wrappedExpiry = name.domain.wrappedDomain?.expiryDate
    if (wrappedExpiry !== undefined)
      return (
        BigInt(wrappedExpiry) -
        V1_GRACE_PERIOD_SECONDS +
        MIGRATION_EXPIRY_BONUS_SECONDS
      )
  }
  throw new Error(
    `The expiry of "${name.domain.name}" is unavailable. Refresh before upgrading.`,
  )
}
