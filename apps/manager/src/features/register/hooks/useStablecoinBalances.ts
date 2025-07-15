import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import {
  ERC20_ABI,
  formatTokenBalance,
  getChainInfo,
  STABLECOINS,
} from '../utils'

export interface StablecoinWithBalance {
  id: string
  name: string
  address: string
  chainId: number
  icon: string
  decimals: number
  balance: bigint
  formattedBalance: string
  chainInfo: ReturnType<typeof getChainInfo>
}

export function useStablecoinBalances() {
  const { address, isConnected, chain } = useAccount()

  const availableStablecoins = useMemo(() => {
    if (!chain) return []
    return STABLECOINS.filter((coin) => coin.chainId === chain.id)
  }, [chain])

  const contracts = useMemo(() => {
    if (!address || availableStablecoins.length === 0) return []

    return availableStablecoins.map((coin) => ({
      address: coin.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf' as const,
      args: [address] as const,
      chainId: coin.chainId,
    }))
  }, [address, availableStablecoins])

  const {
    data: balanceData,
    isLoading,
    error,
  } = useReadContracts({
    contracts,
    query: {
      enabled: !!address && isConnected && contracts.length > 0,
      staleTime: 30000,
      refetchInterval: 60000,
    },
  })

  const stablecoinsWithBalances = useMemo(() => {
    if (!balanceData || !address || availableStablecoins.length === 0) {
      if (chain?.id === 31337 && process.env.NODE_ENV === 'development') {
        return availableStablecoins.map((coin) => ({
          ...coin,
          balance: BigInt(1000 * 10 ** coin.decimals),
          formattedBalance: '$1,000.00',
          chainInfo: getChainInfo(coin.chainId),
        }))
      }
      return []
    }

    const coinsWithBalances: StablecoinWithBalance[] = availableStablecoins.map(
      (coin, index) => {
        const balanceResult = balanceData[index]
        const balance =
          balanceResult?.status === 'success'
            ? (balanceResult.result as bigint)
            : 0n

        return {
          ...coin,
          balance,
          formattedBalance: formatTokenBalance(balance, coin.decimals, false),
          chainInfo: getChainInfo(coin.chainId),
        }
      },
    )

    return coinsWithBalances
      .filter((coin) => coin.balance > 0n)
      .sort((a, b) => (a.balance > b.balance ? -1 : 1))
  }, [balanceData, address, availableStablecoins, chain])

  const top3Stablecoins = useMemo(() => {
    return stablecoinsWithBalances.slice(0, 3)
  }, [stablecoinsWithBalances])

  return {
    stablecoins: stablecoinsWithBalances,
    top3Stablecoins,
    isLoading,
    error,
    hasBalances: stablecoinsWithBalances.length > 0,
  }
}
