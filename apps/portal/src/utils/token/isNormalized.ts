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
 * 1. End with .eth
 * 2. Have at least one label before .eth
 * 3. All labels must be valid (no normalization errors)
 */
export const isValidEnsName = (name: string) => {
  // Must end with .eth
  if (!name.endsWith('.eth')) {
    return false
  }

  try {
    const labels = ens_split(name)
    // Must have at least 2 labels (name + eth) and no errors
    return labels.length >= 2 && labels.every((label) => !label.error)
  } catch {
    return false
  }
}
