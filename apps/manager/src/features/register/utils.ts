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
    id: 'usdc-anvil',
    name: 'USDC (Anvil)',
    address: '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e',
    chainId: 31337,
    icon: 'USDC',
    decimals: 6,
  },
  {
    id: 'usdt-anvil',
    name: 'USDT (Anvil)',
    address: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0',
    chainId: 31337,
    icon: 'USDT',
    decimals: 6,
  },
  {
    id: 'dai-anvil',
    name: 'DAI (Anvil)',
    address: '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82',
    chainId: 31337,
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
    31337: { name: 'Anvil', icon: '🔨' },
  }

  return (
    chainMap[chainId as keyof typeof chainMap] || { name: 'Unknown', icon: '?' }
  )
}
