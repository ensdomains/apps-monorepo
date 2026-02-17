/**
 * Determines if a domain name is premium based on its length.
 * Premium domains are 3–4 characters (excluding .eth).
 * Names with 1–2 chars are not registerable per ENS rules (minimum 3 chars).
 */
export const determinePremium = (name: string): boolean => {
  const normalized = name.trim().toLowerCase()
  const label = normalized.endsWith('.eth')
    ? normalized.replace('.eth', '')
    : normalized
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

  const name = domainName.includes('.')
    ? domainName.slice(0, domainName.lastIndexOf('.'))
    : domainName
  const length = name.length
  if (length < 3 || length > 4) return undefined

  const variant: 'premium-3' | 'premium-4' =
    length === 3 ? 'premium-3' : 'premium-4'
  return {
    label: `${length} character premium name`,
    variant,
  } as const
}
