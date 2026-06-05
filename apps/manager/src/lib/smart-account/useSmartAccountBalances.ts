'use client'

import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { logger } from '@ens-apps/utils/logger'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import {
  type Address,
  erc20Abi,
  formatUnits,
  maxUint256,
  parseEther,
} from 'viem'
import { getBalance, readContract } from 'viem/actions'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import { publicClient } from '@/lib/wagmi'
import type { EthBalance, StablecoinBalance } from './types'

// Minimum owner ETH to (reliably) afford the one-time registrar `approve` at
// elevated Sepolia gas. Mirrors the api-worker faucet drip target
// (`APPROVAL_GAS_ETH_TARGET`) so the frontend requests a top-up exactly when
// the worker would drip.
const MIN_OWNER_ETH_FOR_APPROVE = parseEther('0.005')
// A manager max-approve sets the allowance to ~uint256 max; treat anything past
// half of that as "already approved" (matches the worker's gate).
const REGISTRAR_APPROVED_THRESHOLD = maxUint256 / 2n

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
   * True when the EOA owner can't afford the one-time registrar `approve` AND
   * hasn't approved yet. Drives the auto-fund ETH top-up: the HCA flow is
   * Warp-sponsored except that approve (a non-sponsorable EOA tx — the mock
   * tokens have no permit), so the owner needs a little ETH for it exactly
   * once. Gated on "not yet approved" so an already-approved (max) owner that's
   * low on ETH doesn't trigger endless top-up requests.
   */
  readonly needsApprovalGasTopUp: boolean
  readonly isLoadingApprovalGasState: boolean
}

export function useSmartAccountBalances(
  params: UseSmartAccountBalancesParams,
): UseSmartAccountBalancesResult {
  const { accountAddress, ownerAddress } = params

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

  // EOA approve-gas readiness. Reads the owner's native ETH plus its registrar
  // allowance for every payment token; needs a top-up only when it can't afford
  // an approve and hasn't approved yet. Mirrors the api-worker faucet gate.
  const {
    data: needsApprovalGasTopUp = false,
    isLoading: isLoadingApprovalGasState,
  } = useQuery({
    queryKey: $qk({
      $scope: 'wallet',
      $action: 'approvalGasState',
      address: ownerAddress,
    }),
    queryFn: async () => {
      if (!ownerAddress) return false

      const [ethBalance, ...allowances] = await Promise.all([
        getBalance(publicClient, { address: ownerAddress }),
        ...Object.values(SUPPORTED_TOKENS).map((tokenAddress) =>
          readContract(publicClient, {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [ownerAddress, ENS_SEPOLIA_CONTRACTS.ETHRegistrar],
          }),
        ),
      ])

      // Approvals are per-token, so the registrar is only "approved" once every
      // payment token has a (max) allowance.
      const hasApprovedRegistrar = allowances.every(
        (allowance) => allowance >= REGISTRAR_APPROVED_THRESHOLD,
      )

      return ethBalance < MIN_OWNER_ETH_FOR_APPROVE && !hasApprovedRegistrar
    },
    enabled: !!ownerAddress,
    refetchInterval: 30000,
  })

  return {
    smartAccountEthBalance: smartAccountEthBalance ?? null,
    isLoadingSmartAccountEth,
    stablecoinBalances,
    isLoadingBalances,
    needsApprovalGasTopUp,
    isLoadingApprovalGasState,
  }
}
