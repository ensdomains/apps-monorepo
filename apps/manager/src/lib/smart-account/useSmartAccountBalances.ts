'use client'

import { logger } from '@ens-apps/utils/logger'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { type Address, erc20Abi, formatUnits } from 'viem'
import { getBalance, readContract } from 'viem/actions'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import { publicClient } from '@/lib/wagmi'
import { backendClient } from '@/utils/backend-client'
import type { EthBalance, StablecoinBalance } from './types'

/**
 * The stablecoins to read balances for, keyed by symbol → address. The api-worker
 * faucet is the source of truth: it mints whatever `/wallet/tokens` reports, so
 * reading those same addresses guarantees the UI can never drift from the faucet
 * (which happens when the deployed worker and the app are built against
 * different ensjs token-address pins). Falls back to the app's local
 * `SUPPORTED_TOKENS` if the endpoint is unavailable (e.g. an older worker
 * deployment that predates `/wallet/tokens`).
 */
function useFaucetTokens(): Record<string, Address> {
  const { data } = useQuery({
    queryKey: $qk({ $scope: 'wallet', $action: 'faucetTokens' }),
    queryFn: async () => {
      const response = await backendClient.wallet.tokens.$get()
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      const { tokens } = await response.json()
      return Object.fromEntries(
        Object.entries(tokens).map(([symbol, t]) => [symbol, t.address]),
      ) as Record<string, Address>
    },
    // Token addresses are effectively static for a given deployment.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })

  // Until the faucet token list loads (or if it fails), fall back to the app's
  // compiled-in addresses so balances still render.
  return data ?? SUPPORTED_TOKENS
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
  const faucetTokens = useFaucetTokens()

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
      // Refetch if the faucet token set resolves/changes after the first read.
      tokens: Object.values(faucetTokens).join(','),
    }),
    queryFn: async () => {
      logger.info('🔍 [CONTEXT] Fetching balances for:', balanceAddress)
      if (!balanceAddress) return []

      const results = await Promise.allSettled(
        Object.entries(faucetTokens).map(
          async ([tokenName, tokenAddress]): Promise<StablecoinBalance> => {
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
    balancesUpdatedAt,
  }
}
