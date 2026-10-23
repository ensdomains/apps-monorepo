import type { LookupRecord } from '@ens-apps/indexer/bigname'
import { decodeLabelhash, isEncodedLabelhash } from '@ensdomains/ensjs/utils'
import { labelhash } from 'viem'

/** Put the requested labels back where bigname answered with their hashes. */
export const healUnknownLabels = (
  record: LookupRecord,
  requestedName: string,
): LookupRecord => {
  const requested = requestedName.split('.')
  const stored = record.name.split('.')
  if (stored.length !== requested.length) return record
  return {
    ...record,
    name: stored
      .map((label, i) => {
        const candidate = requested[i] ?? label
        return isEncodedLabelhash(label) &&
          labelhash(candidate) === decodeLabelhash(label)
          ? candidate
          : label
      })
      .join('.'),
  }
}
