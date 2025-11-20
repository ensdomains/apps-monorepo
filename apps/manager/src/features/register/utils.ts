import { NameAvailabilityError } from './machines/searchNameMachine'

export const isNameAvailabilityError = (
  error: unknown,
): error is NameAvailabilityError => {
  return error instanceof NameAvailabilityError
}
export const getErrorMessage = (error: unknown) => {
  if (isNameAvailabilityError(error)) {
    return error.cause
  }
  return error
}

/**
 * Determines if a domain name is premium based on its length
 * Premium domains are 4 characters or less (excluding .eth)
 */
export const determinePremium = (name: string): boolean => {
  const normalized = name.trim().toLowerCase()
  const label = normalized.endsWith('.eth')
    ? normalized.replace('.eth', '')
    : normalized
  return label.length > 0 && label.length <= 4
}

export const STABLECOINS = {
  USDC: {
    id: 'usdc',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    address: '0x9028ab8e872af36c30c959a105cb86d1038412ae', // MockUSDC
    icon: '🪙',
  },
  DAI: {
    id: 'dai',
    name: 'Dai Stablecoin',
    symbol: 'DAI',
    decimals: 18,
    address: '0x6630589c2e6364a96bb7acf0d9d64ac9c1dd3528', // MockDAI
    icon: '🪙',
  },
} as const
