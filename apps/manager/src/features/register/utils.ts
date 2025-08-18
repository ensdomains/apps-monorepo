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
export const STABLECOINS: Record<
  'USDC' | 'DAI',
  {
    id: string
    name: string
    address: `0x${string}`
    chainId: number
    decimals: number
  }
> = {
  USDC: {
    id: 'usdc',
    name: 'USDC (Local)',
    address: '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512', // Mock address for UI
    chainId: 31338, // Updated to match our custom chain

    decimals: 6,
  },
  DAI: {
    id: 'dai',
    name: 'DAI (Local)',
    address: '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0', // Mock address for UI
    chainId: 31338, // Updated to match our custom chain
    decimals: 18,
  },
} as const

export type StablecoinConfig = (typeof STABLECOINS)[keyof typeof STABLECOINS]

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

// Extended stablecoin interface with balance information
export interface StablecoinWithBalance extends StablecoinConfig {
  balance: bigint
  formattedBalance: string
  chainInfo: ReturnType<typeof getChainInfo>
}

// Helper functions for stablecoin operations
export function getAvailableStablecoins(chainId?: number): StablecoinConfig[] {
  if (!chainId) return []
  return Object.values(STABLECOINS).filter((coin) => coin.chainId === chainId)
}

export function getStablecoinByAddress(
  stablecoins: StablecoinWithBalance[],
  address: string,
): StablecoinWithBalance | undefined {
  return stablecoins.find(
    (coin) => coin.address.toLowerCase() === address.toLowerCase(),
  )
}

export function createStablecoinWithBalance(
  coin: StablecoinConfig,
  balance: bigint = 0n,
): StablecoinWithBalance {
  return {
    ...coin,
    balance,
    formattedBalance: formatTokenBalance(balance, coin.decimals, false),
    chainInfo: getChainInfo(coin.chainId),
  }
}

export function getAllStablecoinsWithBalances(
  availableStablecoins: StablecoinConfig[],
  stablecoinsWithBalances: StablecoinWithBalance[],
): StablecoinWithBalance[] {
  return availableStablecoins.map((coin) => {
    const existing = stablecoinsWithBalances.find(
      (c) => c.address === coin.address,
    )
    return existing || createStablecoinWithBalance(coin, 0n)
  })
}
