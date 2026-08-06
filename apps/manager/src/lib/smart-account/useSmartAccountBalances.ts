'use client'

import {
  getDestinationContracts,
  getSourceContracts,
} from '@ens-apps/smart-account'
import { logger } from '@ens-apps/utils/logger'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import type { PublicClient } from 'viem'
import { type Address, erc20Abi, formatUnits } from 'viem'
import { getBalance, readContract } from 'viem/actions'
import { baseSepolia, sepolia } from 'viem/chains'
import { baseSepoliaPublicClient, publicClient } from '@/lib/wagmi'
import type { EthBalance, StablecoinBalance } from './types'

/**
 * The stablecoins to read balances for, keyed by symbol → address.
 *
 * Standalone-HCA path: the supported payment tokens are the REAL Circle Sepolia
 * USDC (the HCA validator's PAYMENT_TOKEN / SECONDARY_PAYMENT_TOKEN) and the
 * Base Sepolia USDC (for cross-chain funding). The old mock-token faucet set
 * (`/wallet/tokens` → MockUSDC/MockDAI) is not used.
 */
const HCA_BALANCE_TOKENS: Record<
  string,
  { address: Address; chainId: number }
> = {
  USDC: {
    address: getDestinationContracts(sepolia.id).usdc,
    chainId: sepolia.id,
  },
  USDC_BASE: {
    address: getSourceContracts(baseSepolia.id).usdc,
    chainId: baseSepolia.id,
  },
}

interface UseSmartAccountBalancesParams {
  readonly accountAddress: Address | null
  readonly ownerAddress: Address | null
}

interface UseSmartAccountBalancesResult {
  readonly smartAccountEthBalance: EthBalance | null
  readonly isLoadingSmartAccountEth: boolean
  readonly stablecoinBalances: StablecoinBalance[]
  readonly isLoadingBalances: boolean
  /**
   * Timestamp (ms) of the last successful stablecoin-balance read. Advances
   * only on a genuine refetch — not on render churn — so consumers can use it
   * as a stable retry trigger for balance-dependent side effects.
   */
  readonly balancesUpdatedAt: number
}

export function useSmartAccountBalances(
  params: UseSmartAccountBalancesParams,
): UseSmartAccountBalancesResult {
  const { accountAddress, ownerAddress } = params

  // Read balances against the exact tokens the faucet mints (see useFaucetTokens).
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

  // HCA-only: stablecoin/ERC-20 balances belong to the EOA owner, not the
  // smart account. ETH balance above is fetched against the SCA so the
  // gas-funding flow sees it.
  const balanceAddress = ownerAddress

  const {
    data: stablecoinBalances = [],
    isLoading: isLoadingBalances,
    dataUpdatedAt: balancesUpdatedAt,
  } = useQuery({
    queryKey: $qk({
      $scope: 'wallet',
      $action: 'stablecoinBalances',
      address: balanceAddress,
      tokens: Object.values(HCA_BALANCE_TOKENS)
        .map((t) => t.address)
        .join(','),
    }),
    queryFn: async () => {
      logger.info('🔍 [CONTEXT] Fetching balances for:', balanceAddress)
      if (!balanceAddress) return []

      const results = await Promise.allSettled(
        Object.entries(HCA_BALANCE_TOKENS).map(
          async ([
            tokenName,
            { address: tokenAddress, chainId },
          ]): Promise<StablecoinBalance> => {
            const client: PublicClient =
              chainId === baseSepolia.id
                ? (baseSepoliaPublicClient as PublicClient)
                : publicClient
            const [balance, decimals] = await Promise.all([
              readContract(client, {
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [balanceAddress],
              }),
              readContract(client, {
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'decimals',
              }),
            ])

            return {
              address: tokenAddress,
              symbol: tokenName,
              chainId,
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
    balancesUpdatedAt,
  }
}
