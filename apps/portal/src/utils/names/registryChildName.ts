import type { NameRowFields } from '@ens-apps/bigname'

/**
 * A registry child bigname lists without a name row: a node known only from
 * registry owner events (an ENSv1 `setSubnodeOwner` child, say). Address-name
 * and subname rows still list it, with a readable `name` when the label is
 * known, but every name route answers 404 for it.
 *
 * bigname has no row flag for this (v0.4.1); the only signal is an
 * `unregistered` status with no `created_at`, which a name row always carries.
 */
export const hasNameRow = (
  row: Pick<NameRowFields, 'registration_status' | 'created_at'>,
): boolean =>
  !(row.registration_status === 'unregistered' && row.created_at === undefined)

/** bigname's spelling of a label it cannot state: `[<64 lowercase hex>]`. */
const UNKNOWN_LABEL = /^\[[0-9a-f]{64}\]$/

export const isUnknownLabel = (label: string): boolean =>
  UNKNOWN_LABEL.test(label)

/**
 * A name for display, each `[<labelhash>]` label shown as "[label unknown]".
 * The bracketed form stays the name's identity (bigname accepts it on name
 * routes); only what the reader sees changes.
 */
export const displayNameWithUnknownLabels = (name: string): string =>
  name
    .split('.')
    .map((label) => (isUnknownLabel(label) ? '[label unknown]' : label))
    .join('.')
