import { BASE_PRICE_PER_YEAR } from './machines/registrationMachine'
import { NameAvailabilityError } from './services/checkNameAvailabilityService'

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

// ERC20 ABI for balanceOf function
export const ERC20_ABI = [
  {
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Stablecoin configurations for different chains
export const STABLECOINS = [
  {
    id: 'usdc-local',
    name: 'USDC (Local)',
    address: '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e', // Mock address for UI
    chainId: 31338, // Updated to match our custom chain
    icon: 'USDC',
    decimals: 6,
  },
  {
    id: 'usdt-local',
    name: 'USDT (Local)',
    address: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0', // Mock address for UI
    chainId: 31338, // Updated to match our custom chain
    icon: 'USDT',
    decimals: 6,
  },
  {
    id: 'dai-local',
    name: 'DAI (Local)',
    address: '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82', // Mock address for UI
    chainId: 31338, // Updated to match our custom chain
    icon: 'DAI',
    decimals: 18,
  },
] as const

export type StablecoinConfig = (typeof STABLECOINS)[number]

export function formatTokenBalance(
  balance: bigint,
  decimals: number,
  isNative = false,
): string {
  const divisor = BigInt(10 ** decimals)
  const wholePart = balance / divisor
  const fractionalPart = balance % divisor

  if (isNative) {
    const ethValue =
      Number(wholePart) + Number(fractionalPart) / Number(divisor)
    return ethValue.toFixed(4)
  }

  const usdValue = Number(wholePart) + Number(fractionalPart) / Number(divisor)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usdValue)
}

export function getChainInfo(chainId: number) {
  const chainMap = {
    1: { name: 'Ethereum', icon: '⟠' },
    31338: { name: 'Anvil', icon: '🔨' },
  }

  return (
    chainMap[chainId as keyof typeof chainMap] || { name: 'Unknown', icon: '?' }
  )
}

export function calculateRegistrationPrice(duration: number) {
  const basePricePerYear = BigInt(BASE_PRICE_PER_YEAR)
  const totalPrice = basePricePerYear * BigInt(duration)
  console.log(
    '💰 Calculated price:',
    totalPrice.toString(),
    'for duration:',
    duration,
  )
  return totalPrice
}
