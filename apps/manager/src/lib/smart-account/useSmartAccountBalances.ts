'use client'

import { getDestinationContracts } from '@ens-apps/smart-account'
import { logger } from '@ens-apps/utils/logger'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { type Address, erc20Abi, formatUnits } from 'viem'
import { readContract } from 'viem/actions'
import { chain } from '@/config'
import { publicClient } from '@/lib/wagmi'
import type { StablecoinBalance } from './types'

/**
 * The token the standalone-HCA route is paid in — the manifest's funding token,
 * which is what the funding permit actually debits.
 *
 * Exported so the affordability gates can match balances against the SAME
 * address this list is built from. They must not resolve the token
 * independently: a lookup keyed on a different USDC would silently find nothing
 * and read as "no balance" rather than failing loudly.
 */
export const HCA_PAYMENT_TOKEN: Address = getDestinationContracts(chain.id).usdc

/**
 * The stablecoins to read balances for, keyed by symbol → address.
 *
 * Standalone-HCA path: the only supported payment token is the manifest funding
 * token (the HCA validator's PAYMENT_TOKEN / SECONDARY_PAYMENT_TOKEN). The old
 * mock-token faucet set (`/wallet/tokens` → MockUSDC/MockDAI) is not used —
 * registrations pay in that one token, so it is the only balance the picker and
 * low-balance checks care about.
 */
const HCA_BALANCE_TOKENS: Record<string, Address> = {
  USDC: HCA_PAYMENT_TOKEN,
}

interface UseSmartAccountBalancesParams {
  readonly ownerAddress: Address | null
}

interface UseSmartAccountBalancesResult {
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
  const { ownerAddress } = params

  // HCA-only: stablecoin/ERC-20 balances belong to the EOA owner, not the
  // smart account.
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
      tokens: Object.values(HCA_BALANCE_TOKENS).join(','),
    }),
    queryFn: async () => {
      logger.info('🔍 [CONTEXT] Fetching balances for:', balanceAddress)
      if (!balanceAddress) return []

      const results = await Promise.allSettled(
        Object.entries(HCA_BALANCE_TOKENS).map(
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
    stablecoinBalances,
    isLoadingBalances,
    balancesUpdatedAt,
  }
}
