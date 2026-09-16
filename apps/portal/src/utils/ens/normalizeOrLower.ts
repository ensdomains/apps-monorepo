import { normalize } from 'viem/ens'

/**
 * Normalizes a name for hashing, tolerating one the UGC layer never normalized.
 *
 * A name that fails ENSIP-15 still has a namehash the indexer keyed its events
 * under, so falling back to the lowercased form finds those rows instead of
 * throwing on a name the rest of the page renders fine.
 */
export const normalizeOrLower = (name: string): string => {
  try {
    return normalize(name)
  } catch {
    return name.toLowerCase()
  }
}
