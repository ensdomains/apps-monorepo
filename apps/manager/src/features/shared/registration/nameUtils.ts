import { getDestinationContracts } from '@ens-apps/smart-account'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { chain } from '@/config'

export class NameAvailabilityError extends TaggedError(
  'NameAvailabilityError',
)<{
  cause: unknown
}> {}

export const isNameAvailabilityError = (
  error: unknown,
): error is NameAvailabilityError => {
  return error instanceof NameAvailabilityError
}

export const getErrorMessage = (error: unknown): unknown => {
  if (isNameAvailabilityError(error)) {
    return error.cause
  }
  return error
}

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

// Standalone-HCA payment tokens. The HCA validator only accepts the REAL
// Circle Sepolia USDC (its PAYMENT_TOKEN / SECONDARY_PAYMENT_TOKEN are both
// this address), so the picker offers USDC only — no mock USDC/DAI/USDT.
export const STABLECOINS = {
  USDC: {
    id: 'usdc',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    address: getDestinationContracts(chain.id).usdc,
    icon: USDCIcon,
  },
} as const
