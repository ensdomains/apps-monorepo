import { ens_normalize, ens_split } from '@adraffy/ens-normalize'

export const isNormalized = (name: string) => {
  try {
    return ens_normalize(name) === name
  } catch {
    return false
  }
}

/**
 * Check if a name is a valid ENS name.
 * Must be:
 * 1. Have at least one label (e.g., "eth", "example.eth", "sub.example.eth")
 * 2. Be normalized (lowercase, no invalid characters)
 * 3. All labels must be valid (no normalization errors)
 *
 * Note: 1LDs like "eth" are valid ENS names - doesn't need to end with .eth
 */
export const isValidEnsName = (name: string) => {
  if (!name || !isNormalized(name)) {
    return false
  }

  try {
    const labels = ens_split(name)
    // Must have at least 1 label and no errors
    return labels.length >= 1 && labels.every((label) => !label.error)
  } catch {
    return false
  }
}
