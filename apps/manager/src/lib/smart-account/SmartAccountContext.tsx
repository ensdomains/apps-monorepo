'use client'

import type { Signer } from '@ens-apps/transaction-manager'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  useClient as useParaClient,
  useWallet as useParaWallet,
} from '@getpara/react-sdk-lite'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { KernelValidator } from '@zerodev/sdk'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { type Address, formatUnits } from 'viem'
import { getBalance, readContract } from 'viem/actions'
import { useWalletClient } from 'wagmi'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { backendClient } from '@/utils/backend-client'
import { ERC20_ABI } from '../ens.abi'
import type { StoredSession } from './sessions/types'
import type { KernelAccountState, WalletSource } from './types'
import { initializeKernelAccount, type KernelConfig } from './zerodev/kernel'

/**
 * Smart Account Context
 *
 * Provides shared kernel account state across all components.
 * This ensures session data is shared between SmartSessionProvider and RegistrationPage.
 */

interface SmartAccountContextValue extends KernelAccountState {
  /** Callback to update session data when a session is created */
  setSessionData: (
    session: StoredSession,
    sessionClient: KernelAccountState['client'],
  ) => void
}

const SmartAccountContext = createContext<SmartAccountContextValue | null>(null)

interface SmartAccountContextProviderProps {
  children: ReactNode
  /** Account type - 'simple' or 'hca' (Hierarchical Control Account) */
  accountType?: 'simple' | 'hca'
}

/**
 * Smart Account Context Provider
 *
 * Wraps the application and provides shared kernel account state.
 * Place this inside wallet providers (ParaProvider, wagmi).
 */
export function SmartAccountContextProvider({
  children,
  accountType = 'hca',
}: SmartAccountContextProviderProps) {
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

  const [client, setClient] = useState<KernelAccountState['client']>(null)
  const [accountAddress, setAccountAddress] = useState<Address | null>(null)
  const [accountConfig, setAccountConfig] = useState<KernelConfig | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<StoredSession | null>(null)
  const [isSessionClient, setIsSessionClient] = useState(false)
  const [ecdsaValidator, setEcdsaValidator] =
    useState<KernelValidator<'ECDSAValidator'> | null>(null)
  const [isAccountReady, setIsAccountReady] = useState(false)

  const initializedRef = useRef<string | null>(null)

  // Balance queries
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

  const balanceAddress = accountType === 'hca' ? wagmiAddress : accountAddress

  const { data: stablecoinBalances = [], isLoading: isLoadingBalances } =
    useQuery({
      queryKey: $qk({
        $scope: 'wallet',
        $action: 'stablecoinBalances',
        address: balanceAddress,
      }),
      queryFn: async () => {
        if (!balanceAddress) return []
        const balances = []
        for (const [tokenName, tokenAddress] of Object.entries(
          SUPPORTED_TOKENS,
        )) {
          try {
            const balance = await readContract(publicClient, {
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [balanceAddress],
            })
            const decimals = await readContract(publicClient, {
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
      enabled: !!balanceAddress,
      refetchInterval: 30000,
    })

  // Auto-funding mutation
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
      const response = await backendClient.wallet.fund.$post({
        json: { address },
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
        toast.dismiss(`fund-wallet-${address}`)
        return
      }
      toast.success('Wallet funded successfully', {
        description: `Wallet ${address} funded successfully`,
        id: `fund-wallet-${address}`,
      })
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

  // Initialize kernel account
  const initializeAccount = useCallback(async () => {
    if (!isWalletReady) {
      setClient(null)
      setAccountAddress(null)
      setAccountConfig(null)
      setSession(null)
      setIsSessionClient(false)
      setEcdsaValidator(null)
      setIsAccountReady(false)
      setError(null)
      return
    }

    const key =
      walletSource === 'external-wallet'
        ? `kernel-external-${wagmiAddress}`
        : `kernel-para-${paraClient?.toString()}`

    if (initializedRef.current === key) return

    setIsLoading(true)
    setError(null)

    try {
      if (!wagmiWalletClient) {
        throw new Error('Kernel requires an external wallet connection')
      }

      const result = await initializeKernelAccount({
        walletClient: wagmiWalletClient,
        accountType,
      })

      setClient(result.client)
      setSession(null)
      setIsSessionClient(false)
      setAccountAddress(result.address)
      setAccountConfig(result.config)
      setEcdsaValidator(result.ecdsaValidator)
      setIsAccountReady(true)

      console.log('🔐 [CONTEXT] Kernel account initialized:', result.address)

      initializedRef.current = key
    } catch (err) {
      console.error('[CONTEXT] Failed to initialize kernel account:', err)
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
    accountType,
  ])

  useEffect(() => {
    initializeAccount()
  }, [initializeAccount])

  // Auto-fund if balance is low
  const addressToFund = accountType === 'hca' ? wagmiAddress : accountAddress

  // biome-ignore lint/correctness/useExhaustiveDependencies: Should not rerun from mutation status
  useEffect(() => {
    if (
      !addressToFund ||
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

    if (totalBalance >= 500n) return

    autoFundingMutation.mutate(addressToFund as Address)
  }, [addressToFund, isLoading, isLoadingBalances, stablecoinBalances])

  // Create signer
  const signer: Signer | null = useMemo(() => {
    if (!client || !accountAddress) return null

    const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
    if (!pimlicoApiKey) {
      console.error('Pimlico API key not configured - cannot create signer')
      return null
    }

    return {
      type: 'kernel' as const,
      account: client,
      config: {
        chain: customSepolia,
        accountAddress,
        accountType: accountConfig?.accountType,
        pimlicoApiKey,
        isSessionClient,
      },
    }
  }, [client, accountAddress, accountConfig, isSessionClient])

  // Callback to update session data
  const setSessionData = useCallback(
    (
      newSession: StoredSession,
      sessionClient: KernelAccountState['client'],
    ) => {
      console.log('📦 [CONTEXT] Setting session data:', newSession.id)
      setSession(newSession)
      setClient(sessionClient)
      setIsSessionClient(true)
    },
    [],
  )

  const contextValue: SmartAccountContextValue = {
    type: 'kernel',
    client,
    config: accountConfig,
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
    session,
    isSessionClient,
    ecdsaValidator,
    isAccountReady,
    setSessionData,
  }

  return (
    <SmartAccountContext.Provider value={contextValue}>
      {children}
    </SmartAccountContext.Provider>
  )
}

/**
 * Hook to access shared smart account state
 *
 * Must be used within SmartAccountProvider.
 * Returns the shared kernel account state including session data.
 */
export function useSmartAccountContext(): SmartAccountContextValue {
  const context = useContext(SmartAccountContext)
  if (!context) {
    throw new Error(
      'useSmartAccountContext must be used within SmartAccountProvider',
    )
  }
  return context
}

/**
 * Hook to check if smart account context is available
 *
 * Returns null if outside SmartAccountProvider (safe to use anywhere).
 */
export function useSmartAccountContextSafe(): SmartAccountContextValue | null {
  return useContext(SmartAccountContext)
}
