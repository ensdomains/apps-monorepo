'use client'

import type { Signer } from '@ens-apps/transaction-manager'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  useClient as useParaClient,
  useWallet as useParaWallet,
} from '@getpara/react-sdk-lite'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { type Address, formatUnits } from 'viem'
import { useWalletClient } from 'wagmi'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { backendClient } from '@/utils/backend-client'
import { ERC20_ABI } from '../ens.abi'
import { initializePimlicoAccount, type PimlicoConfig } from './pimlico'
import {
  initializeRhinestoneAccount,
  type RhinestoneConfig,
} from './rhinestone'
import type {
  PimlicoAccountState,
  RhinestoneAccountState,
  SmartAccountState,
  UseSmartAccountConfig,
  WalletSource,
} from './types'

export type {
  ParaClient,
  PimlicoAccountState,
  RhinestoneAccountState,
  SmartAccountState,
  UseSmartAccountConfig,
} from './types'
export { isPimlicoAccount, isRhinestoneAccount } from './types'

/**
 * Unified Smart Account Hook
 *
 * Single entry point for smart account management. Supports multiple providers
 * (Pimlico, Rhinestone) with a consistent interface.
 *
 * @example
 * // Use Rhinestone (default) - gas sponsorship enabled by default on testnet
 * const account = useSmartAccount()
 * const account = useSmartAccount({ type: 'rhinestone' })
 *
 * @example
 * // Use Pimlico
 * const account = useSmartAccount({ type: 'pimlico' })
 *
 * @example
 * // Type-safe usage
 * if (isRhinestoneAccount(account)) {
 *   // account.client is RhinestoneAccount
 * }
 * if (isPimlicoAccount(account)) {
 *   // account.client is SmartAccountClient
 * }
 */
export function useSmartAccount(
  config?: UseSmartAccountConfig,
): SmartAccountState {
  const providerType = config?.type ?? 'rhinestone'
  const accountType = config?.accountType ?? 'simple'

  const paraClient = useParaClient()

  const { data: paraWallet } = useParaWallet()
  const { data: wagmiWalletClient } = useWalletClient()

  const wagmiAddress = wagmiWalletClient?.account?.address
  const hasWagmi = !!wagmiAddress
  const hasPara = !paraWallet?.isExternal && !!paraWallet && !!paraClient

  const walletSource: WalletSource =
    paraWallet?.isExternal && hasWagmi
      ? 'external-wallet'
      : hasPara
        ? 'para-embedded'
        : null

  const isWalletReady = (paraWallet?.isExternal && hasWagmi) || hasPara

  const [client, setClient] = useState<SmartAccountState['client']>(null)
  const [accountAddress, setAccountAddress] = useState<Address | null>(null)
  const [accountConfig, setAccountConfig] = useState<
    PimlicoConfig | RhinestoneConfig | null
  >(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initializedRef = useRef<string | null>(null)

  const { data: smartAccountEthBalance, isLoading: isLoadingSmartAccountEth } =
    useQuery({
      queryKey: $qk({
        $scope: 'wallet',
        $action: 'smartAccountEthBalance',
        address: accountAddress,
      }),
      queryFn: async () => {
        if (!accountAddress) return null
        const balance = await publicClient.getBalance({
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

  const { data: stablecoinBalances = [], isLoading: isLoadingBalances } =
    useQuery({
      queryKey: $qk({
        $scope: 'wallet',
        $action: 'stablecoinBalances',
        address: accountAddress,
      }),
      queryFn: async () => {
        if (!accountAddress) return []
        const balances = []
        for (const [tokenName, tokenAddress] of Object.entries(
          SUPPORTED_TOKENS,
        )) {
          try {
            const balance = await publicClient.readContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [accountAddress],
            })
            const decimals = await publicClient.readContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: 'decimals',
            })
            balances.push({
              address: tokenAddress,
              symbol: tokenName,
              balance: balance.toString(),
              decimals,
              formattedBalance: `${formatUnits(balance, decimals)} ${tokenName}`,
            })
          } catch {
            // Skip failed fetches
          }
        }
        return balances
      },
      enabled: !!accountAddress,
      refetchInterval: 30000,
    })

  const autoFundingMutation = useMutation({
    mutationKey: $qk({
      $scope: 'wallet',
      $action: 'fund',
      address: accountAddress,
    }),
    mutationFn: async (address: Address) => {
      toast.loading('Funding wallet', {
        description: `Funding wallet ${address} with mock USDC & DAI tokens`,
        id: `fund-wallet-${address}`,
      })
      console.debug('Wallet Funder: Funding wallet', address)

      const response = await backendClient.wallet.fund.$post({
        json: {
          address,
        },
      })
      if (!response.ok) {
        throw new Error(
          `Failed to fund wallet: ${response.statusText} ${await response.text()}`,
        )
      }

      return response.json()
    },
    onSuccess: (data, address, _, context) => {
      if (!data || data.usdcTxHash || !data.daiTxHash) {
        console.log(
          'Wallet Funder: No transaction hashes received, assuming already funded',
        )
        toast.dismiss(`fund-wallet-${address}`)
        return
      }

      toast.success('Wallet funded successfully', {
        description: `Wallet ${address} funded successfully`,
        id: `fund-wallet-${address}`,
      })

      console.log('Wallet Funder: Successfully funded wallet', address, data)

      context.client.invalidateQueries({
        queryKey: $qk({
          $scope: 'wallet',
          $action: 'stablecoinBalances',
        }),
      })
    },
    onError: (error, address) => {
      toast.error('Failed to fund wallet', {
        description: `Failed to fund wallet: ${error.message}`,
        id: `fund-wallet-${address}`,
      })
    },
  })

  const initializeAccount = useCallback(async () => {
    if (!isWalletReady) {
      setClient(null)
      setAccountAddress(null)
      setAccountConfig(null)
      setError(null)
      return
    }

    const key =
      walletSource === 'external-wallet'
        ? `${providerType}-external-${wagmiAddress}`
        : `${providerType}-para-${paraClient?.toString()}`

    if (initializedRef.current === key) return

    setIsLoading(true)
    setError(null)

    try {
      if (providerType === 'pimlico') {
        const result = await initializePimlicoAccount({
          walletSource,
          walletClient: wagmiWalletClient ?? undefined,
          paraClient: paraClient ?? undefined,
          accountType,
          registerHCA: accountType === 'hca', // Register HCA if accountType is 'hca'
        })
        setClient(result.client)
        setAccountAddress(result.address)
        setAccountConfig(result.config)
      } else if (providerType === 'rhinestone') {
        if (!wagmiWalletClient) {
          throw new Error('Rhinestone requires an external wallet connection')
        }
        const result = await initializeRhinestoneAccount({
          walletClient: wagmiWalletClient,
          accountType,
          registerHCA: accountType === 'hca', // Register HCA if accountType is 'hca'
        })
        setClient(result.client)
        setAccountAddress(result.address)
        setAccountConfig(result.config)
      }

      initializedRef.current = key
    } catch (err) {
      console.error(`Failed to initialize ${providerType} account:`, err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [
    isWalletReady,
    walletSource,
    wagmiAddress,
    wagmiWalletClient,
    paraClient,
    providerType,
    accountType,
  ])

  useEffect(() => {
    initializeAccount()
  }, [initializeAccount])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Should not attempt to rerun from mutation status
  useEffect(() => {
    if (
      !accountAddress ||
      isLoading ||
      isLoadingBalances ||
      !autoFundingMutation.isIdle
    )
      return

    const totalBalance = stablecoinBalances.reduce(
      (acc, balance) =>
        acc + BigInt(balance.balance) / BigInt(10 ** balance.decimals),
      0n,
    )

    // Don't fund if the address already has enough tokens
    if (totalBalance >= 500n) {
      console.debug('Wallet Funder: Address already has enough tokens')
      return
    }

    autoFundingMutation.mutate(accountAddress as Address)
  }, [accountAddress, isLoading, isLoadingBalances, stablecoinBalances])

  const signer: Signer | null = useMemo(() => {
    if (!client || !accountAddress) return null

    if (providerType === 'rhinestone') {
      const rhinestoneApiKey = import.meta.env.VITE_RHINESTONE_API_KEY
      if (!rhinestoneApiKey) {
        console.error(
          'Rhinestone API key not configured - cannot create signer',
        )
        return null
      }

      return {
        type: 'rhinestone' as const,
        account: client as NonNullable<RhinestoneAccountState['client']>,
        config: {
          chain: customSepolia,
          accountAddress,
          rhinestoneApiKey,
        },
      }
    }

    const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
    if (!pimlicoApiKey) {
      console.error('Pimlico API key not configured - cannot create signer')
      return null
    }

    const pimlicoConfig = accountConfig as PimlicoConfig | null
    return {
      type: 'pimlico' as const,
      account: client as NonNullable<PimlicoAccountState['client']>,
      config: {
        chain: customSepolia,
        accountAddress,
        accountType: pimlicoConfig?.accountType,
        pimlicoApiKey,
      },
    }
  }, [client, accountAddress, providerType, accountConfig])

  const baseState = {
    accountAddress,
    isLoading,
    error,
    isConnected: isWalletReady && !!client,
    walletSource,
    ownerAddress: (walletSource === 'external-wallet'
      ? wagmiAddress
      : null) as Address | null,
    stablecoinBalances,
    isLoadingBalances,
    smartAccountEthBalance: smartAccountEthBalance ?? null,
    isLoadingSmartAccountEth,
    autoFundingMutation,
    signer,
  }

  if (providerType === 'rhinestone') {
    return {
      ...baseState,
      type: 'rhinestone' as const,
      client: client as RhinestoneAccountState['client'],
      config: accountConfig as RhinestoneConfig | null,
    }
  }

  return {
    ...baseState,
    type: 'pimlico' as const,
    client: client as PimlicoAccountState['client'],
    config: accountConfig as PimlicoConfig | null,
  }
}
