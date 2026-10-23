import type { LookupRecord } from '@ens-apps/indexer/bigname'
import { labelhash } from 'viem'

const ENCODED_LABELHASH = /^\[([0-9a-fA-F]{64})\]$/

/** Put the requested labels back where bigname answered with their hashes. */
export const healUnknownLabel = (
  record: LookupRecord,
  requestedName: string,
): LookupRecord => {
  const stored = record.name.split('.')
  const requested = requestedName.split('.')
  if (stored.length !== requested.length) return record
  let hasHealedLabel = false
  const labels = stored.map((label, i) => {
    const hash = ENCODED_LABELHASH.exec(label)?.[1]
    const candidate = requested[i]
    if (!hash || !candidate || ENCODED_LABELHASH.test(candidate)) return label
    if (labelhash(candidate.toLowerCase()) !== `0x${hash.toLowerCase()}`) {
      return label
    }
    hasHealedLabel = true
    return candidate.toLowerCase()
  })
  return hasHealedLabel ? { ...record, name: labels.join('.') } : record
}
