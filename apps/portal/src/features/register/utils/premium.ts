import { getLabel } from '@/utils/token/getLabel'

export enum PREMIUM_LABEL_VARIANT {
  PREMIUM_3 = 'premium-3',
  PREMIUM_4 = 'premium-4',
}

export type PremiumLabel = {
  label: string
  variant: PREMIUM_LABEL_VARIANT
}

/**
 * Determines if a domain name is premium based on its length.
 * Premium domains are 3–4 characters (first label only).
 * Uses ens_normalize/ens_split for proper label extraction.
 */
export const determinePremium = (name: string): boolean => {
  const label = getLabel(name)
  if (label === null) {
    return false
  }

  return label.length >= 3 && label.length <= 4
}

/**
 * Gets the premium label information for a domain name.
 * Returns undefined if not premium (not 3–4 chars) or has no valid label.
 */
export const getPremiumLabel = (
  domainName: string,
): PremiumLabel | undefined => {
  const label = getLabel(domainName)

  if (!label) {
    return undefined
  }

  const length = label.length

  if (length < 3 || length > 4) {
    return undefined
  }

  const variant: PREMIUM_LABEL_VARIANT =
    length === 3
      ? PREMIUM_LABEL_VARIANT.PREMIUM_3
      : PREMIUM_LABEL_VARIANT.PREMIUM_4

  return { label: `${length} character premium name`, variant }
}
