import { type ExpiryFields, timestampToSeconds } from '@ens-apps/bigname'

/** The BaseRegistrar's grace period after an ENSv1 lease expires. */
const ENS_V1_GRACE_SECONDS = 90 * 24 * 60 * 60

/** Expiry and renewal deadline of a name, in Unix seconds. */
export type ServedExpiry = {
  /** Null when the name has no expiry, or one too large to date. */
  readonly expiry: number | null
  /** End of the renewal grace; null whenever `expiry` is. */
  readonly graceEndsAt: number | null
}

/**
 * The expiry a name's own protocol enforces.
 *
 * - While ENSv1 decides the name (`ens_v1` is served exactly then), its
 *   "Expires" date is the BaseRegistrar lease, `ens_v1.expires_at`, and the
 *   lease's grace ends 90 days later. bigname serves no grace field for the
 *   lease. The top-level `expires_at` and `grace_ends_at` of such a `.eth`
 *   name are its ENSv2 reservation's from the Universal Resolver cutover
 *   (lease plus 62 days, plus 28), not the ENSv1 deadline.
 * - A name with no lease (`ens_v1.expires_at: null`: every subname) and every
 *   ENSv2 name serve their own expiry and grace end at the top level:
 *   `grace_ends_at` already adds 28 days for an ENSv2 `.eth` name and nothing
 *   for a subname.
 *
 * A lease saturated at `i64::MAX` no longer carries its expiry, and a value
 * past `Number.MAX_SAFE_INTEGER` cannot be a `Date`; both read as no expiry.
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
