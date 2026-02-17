/**
 * Gets the label (part before .eth) from a domain name.
 */
const getLabel = (name: string): string => {
  const normalized = name.trim().toLowerCase()
  return normalized.endsWith('.eth')
    ? normalized.replace('.eth', '')
    : normalized
}

/**
 * Validates that a name meets ENS minimum length (3+ chars).
 * Returns an error message if invalid, null if valid.
 */
export const validateNameLength = (name: string): string | null => {
  const label = getLabel(name)
  if (label.length > 0 && label.length < 3) {
    return 'Names must be 3 characters or more to register.'
  }
  return null
}

/**
 * Determines if a domain name is premium based on its length.
 * Premium domains are 3–4 characters (excluding .eth).
 * Names with 1–2 chars are not registerable per ENS rules (minimum 3 chars).
 */
export const determinePremium = (name: string): boolean => {
  const label = getLabel(name)
  return label.length >= 3 && label.length <= 4
}

export type PremiumLabel = {
  label: string
  variant: 'premium-3' | 'premium-4'
}

/**
 * Gets the premium label information for a domain name.
 * Returns undefined if not premium (not 3–4 chars) or has no valid label.
 * Only 3–4 char names are supported; 1–2 char names are not registerable.
 */
export const getPremiumLabel = (
  domainName: string,
): PremiumLabel | undefined => {
  if (!determinePremium(domainName)) return undefined

  const name = getLabel(domainName)
  const length = name.length
  if (length < 3 || length > 4) return undefined

  const variant: 'premium-3' | 'premium-4' =
    length === 3 ? 'premium-3' : 'premium-4'
  return {
    label: `${length} character premium name`,
    variant,
  } as const
}
