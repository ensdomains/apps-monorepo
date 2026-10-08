import {
  type EnsV1Facts,
  MAX_DATE_SECONDS,
  timestampToBigInt,
} from '@ens-apps/indexer/bigname'

type ExpiryFields = {
  readonly expires_at?: string | null
  readonly ens_v1?: EnsV1Facts
}

/**
 * The expiry a name's own protocol enforces, in Unix seconds. While ENSv1
 * decides the name its expiry is the BaseRegistrar lease, `ens_v1.expires_at`;
 * the top-level field of such a `.eth` name is its ENSv2 reservation's. Every
 * other name serves its own expiry at the top level. Null when the name has
 * no expiry, or one too large to date.
 */
export const servedExpiry = (row: ExpiryFields): bigint | null => {
  const expiry = timestampToBigInt(row.ens_v1?.expires_at ?? row.expires_at)
  return expiry === undefined || expiry > MAX_DATE_SECONDS ? null : expiry
}
