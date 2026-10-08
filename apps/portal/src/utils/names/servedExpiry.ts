import { type EnsV1Facts, timestampToSeconds } from '@ens-apps/indexer/bigname'

/** The BaseRegistrar's grace period after an ENSv1 lease expires. */
const ENS_V1_GRACE_SECONDS = 90 * 24 * 60 * 60

type ExpiryFields = {
  readonly expires_at?: string | null
  readonly grace_ends_at?: string | null
  readonly ens_v1?: EnsV1Facts
}

/** Expiry and renewal deadline of a name, in Unix seconds. */
export type ServedExpiry = {
  /** Null when the name has no expiry, or one too large to date. */
  readonly expiry: number | null
  /** End of the renewal grace; null whenever `expiry` is. */
  readonly graceEndsAt: number | null
}

/**
 * The expiry a name's own protocol enforces. While ENSv1 decides the name its
 * expiry is the BaseRegistrar lease, `ens_v1.expires_at`, with 90 days of
 * grace; the top-level fields of such a `.eth` name are its ENSv2
 * reservation's. Every other name serves its own expiry and grace end at the
 * top level. A value too large to date reads as no expiry.
 */
export const servedExpiry = (row: ExpiryFields): ServedExpiry => {
  const lease = row.ens_v1?.expires_at
  if (lease != null) {
    const expiry = timestampToSeconds(lease) ?? null
    return {
      expiry,
      graceEndsAt: expiry === null ? null : expiry + ENS_V1_GRACE_SECONDS,
    }
  }
  const expiry = timestampToSeconds(row.expires_at) ?? null
  return {
    expiry,
    graceEndsAt:
      expiry === null ? null : (timestampToSeconds(row.grace_ends_at) ?? null),
  }
}
