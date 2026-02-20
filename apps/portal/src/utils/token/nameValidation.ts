import { getLabel } from './getLabel'

/**
 * Validates that a name meets ENS minimum length (3+ chars for the first label).
 * Returns an error message if invalid, null if valid.
 * Uses ens_normalize/ens_split for proper label extraction.
 */
export const validateNameLength = (name: string): string | null => {
  const label = getLabel(name)
  if (label === null) return null
  if (label.length > 0 && label.length < 3) {
    return 'Names must be 3 characters or more to register.'
  }
  return null
}
