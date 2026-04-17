'use client'

import { logger } from '@ens-apps/utils/logger'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { type Address, erc20Abi, formatUnits } from 'viem'
import { getBalance, readContract } from 'viem/actions'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import { publicClient } from '@/lib/wagmi'
import type { EthBalance, SmartAccountType, StablecoinBalance } from './types'

interface UseSmartAccountBalancesParams {
  readonly accountAddress: Address | null
  readonly ownerAddress: Address | null
  readonly accountType: SmartAccountType
}

interface UseSmartAccountBalancesResult {
  readonly smartAccountEthBalance: EthBalance | null
  readonly isLoadingSmartAccountEth: boolean
  readonly stablecoinBalances: StablecoinBalance[]
  readonly isLoadingBalances: boolean
}

export function useSmartAccountBalances(
  params: UseSmartAccountBalancesParams,
): UseSmartAccountBalancesResult {
  const { accountAddress, ownerAddress, accountType } = params

  const { data: smartAccountEthBalance, isLoading: isLoadingSmartAccountEth } =
    useQuery({
      queryKey: $qk({
        $scope: 'wallet',
        $action: 'smartAccountEthBalance',
        address: accountAddress,
      }),
      queryFn: async () => {
        if (!accountAddress) return null

        const balance = await getBalance(publicClient, {
          address: accountAddress,
        })

        return {
          balance: balance.toString(),
          formattedBalance: `${parseFloat(formatUnits(balance, 18)).toFixed(4)} ETH`,
        }
      },
      enabled: !!accountAddress,
      refetchInterval: 30000,
    })

  const balanceAddress = accountType === 'hca' ? ownerAddress : accountAddress

  const { data: stablecoinBalances = [], isLoading: isLoadingBalances } =
    useQuery({
      queryKey: $qk({
        $scope: 'wallet',
        $action: 'stablecoinBalances',
        address: balanceAddress,
      }),
      queryFn: async () => {
        logger.info('🔍 [CONTEXT] Fetching balances for:', balanceAddress)
        if (!balanceAddress) return []

        const results = await Promise.allSettled(
          Object.entries(SUPPORTED_TOKENS).map(
            async ([tokenName, tokenAddress]) => {
              const [balance, decimals] = await Promise.all([
                readContract(publicClient, {
                  address: tokenAddress,
                  abi: erc20Abi,
                  functionName: 'balanceOf',
                  args: [balanceAddress],
                }),
                readContract(publicClient, {
                  address: tokenAddress,
                  abi: erc20Abi,
                  functionName: 'decimals',
                }),
              ])

              return {
                address: tokenAddress,
                symbol: tokenName,
                balance: balance.toString(),
                decimals,
                formattedBalance: `${formatUnits(balance, decimals)} ${tokenName}`,
              } satisfies StablecoinBalance
            },
          ),
        )

        return results
          .filter(
            (r): r is PromiseFulfilledResult<StablecoinBalance> =>
              r.status === 'fulfilled',
          )
          .map((r) => r.value)
      },
      enabled: !!balanceAddress,
      refetchInterval: 30000,
    })

  return {
    smartAccountEthBalance: smartAccountEthBalance ?? null,
    isLoadingSmartAccountEth,
    stablecoinBalances,
    isLoadingBalances,
  }
}
