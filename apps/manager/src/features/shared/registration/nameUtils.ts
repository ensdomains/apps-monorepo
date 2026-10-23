import { getDestinationContracts } from '@ens-apps/smart-account'
import { DAI as DAIIcon, USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { chain } from '@/config'
import { TOKENS } from '@/lib/tokens'

/** The bare label of a 2LD: strips a trailing `.eth`, passes labels through. */
export const toLabel = (name: string): string =>
  name.toLowerCase().endsWith('.eth') ? name.slice(0, -4) : name

/**
 * Determines if a domain name is premium based on its length
 * Premium domains are 4 characters or less (excluding .eth)
 */
export const determinePremium = (name: string): boolean => {
  const normalized = name.trim().toLowerCase()
  const label = normalized.endsWith('.eth')
    ? normalized.replace('.eth', '')
    : normalized
  const labelLength = [...label].length
  return labelLength > 0 && labelLength <= 4
}

export type PremiumLabel = {
  label: string
  variant: 'premium-3' | 'premium-4'
}

/**
 * Gets the premium label information for a domain name
 * Returns undefined if the domain is not premium (more than 4 characters) or has no valid label
 */
export const getPremiumLabel = (
  domainName: string,
): PremiumLabel | undefined => {
  if (!determinePremium(domainName)) return undefined

  const name = domainName.includes('.')
    ? domainName.slice(0, domainName.lastIndexOf('.'))
    : domainName
  const length = [...name].length
  if (!length) return undefined

  const variant: 'premium-3' | 'premium-4' =
    length <= 3 ? 'premium-3' : 'premium-4'
  return {
    label: `${length} character premium name`,
    variant,
  } as const
}

// Display metadata for the stables a picker can show; which ones a flow offers
// comes from its balances. Registration lists USDC only (the HCA validator's
// payment token), while renewals, being owner-signed, also take DAI.
export const STABLECOINS = {
  USDC: {
    id: 'usdc',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    address: getDestinationContracts(chain.id).usdc,
    icon: USDCIcon,
  },
  DAI: {
    id: 'dai',
    name: 'Dai',
    symbol: 'DAI',
    decimals: 18,
    address: TOKENS.DAI.address,
    icon: DAIIcon,
  },
} as const
