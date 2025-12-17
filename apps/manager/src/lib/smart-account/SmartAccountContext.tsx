'use client'

import type { Signer } from '@ens-apps/transaction-manager'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  useClient as useParaClient,
  useWallet as useParaWallet,
} from '@getpara/react-sdk-lite'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { KernelAccountClient, KernelValidator } from '@zerodev/sdk'
import type { SmartAccountClient } from 'permissionless'
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
import { type Address, formatUnits, type WalletClient } from 'viem'
import { getBalance, readContract } from 'viem/actions'
import { useWalletClient } from 'wagmi'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { backendClient } from '@/utils/backend-client'
import { ERC20_ABI } from '../ens.abi'
import { initializePimlicoAccount, type PimlicoConfig } from './pimlico'
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
  /** Indicates initial smart account bootstrap has completed (success or not) */
  hasInitialized: boolean
  /** Open the smart session enable modal */
  openSessionModal: () => void
  shouldShowSessionModal: boolean
  clearSessionModalTrigger: () => void
  /** Raw wallet client for EOA operations (e.g., setting primary name) */
  walletClient: WalletClient | null
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

  const [client, setClient] = useState<
    KernelAccountClient | SmartAccountClient | null
  >(null)
  const [accountAddress, setAccountAddress] = useState<Address | null>(null)
  const [accountConfig, setAccountConfig] = useState<
    KernelConfig | PimlicoConfig | null
  >(null)
  const [ownerAddress, setOwnerAddress] = useState<Address | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<StoredSession | null>(null)
  const [isSessionClient, setIsSessionClient] = useState(false)
  const [ecdsaValidator, setEcdsaValidator] =
    useState<KernelValidator<'ECDSAValidator'> | null>(null)
  const [isAccountReady, setIsAccountReady] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)
  const [shouldShowSessionModal, setShouldShowSessionModal] = useState(false)

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

  // For HCA accounts, check balances on the EOA address (tokens are held by EOA)
  // For simple accounts, check balances on the smart account
  // Note: ownerAddress is available for both external wallets and Para embedded wallets
  const balanceAddress = accountType === 'hca' ? ownerAddress : accountAddress

  console.log('💰 [CONTEXT] Balance check:', {
    accountType,
    walletSource,
    ownerAddress,
    accountAddress,
    balanceAddress,
    willQueryBalances: !!balanceAddress,
  })
  const { data: stablecoinBalances = [], isLoading: isLoadingBalances } =
    useQuery({
      queryKey: $qk({
        $scope: 'wallet',
        $action: 'stablecoinBalances',
        address: balanceAddress,
      }),
      queryFn: async () => {
        console.log('🔍 [CONTEXT] Fetching balances for:', balanceAddress)
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
      if (!data || (!data.usdcTxHash && !data.daiTxHash)) {
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

  const initializeAccount = useCallback(async () => {
    if (!isWalletReady) {
      setClient(null)
      setAccountAddress(null)
      setAccountConfig(null)
      setOwnerAddress(null)
      setSession(null)
      setIsSessionClient(false)
      setEcdsaValidator(null)
      setIsAccountReady(false)
      setError(null)
      setHasInitialized(true)
      return
    }

    const key =
      walletSource === 'external-wallet'
        ? `kernel-external-${wagmiAddress}`
        : `pimlico-para-${paraClient?.toString()}`

    if (initializedRef.current === key) return

    setIsLoading(true)
    setError(null)

    try {
      if (walletSource === 'external-wallet') {
        if (!wagmiWalletClient) {
          throw new Error('External wallet requires wagmi wallet client')
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
        // For external wallets, use the wagmi address as owner (EOA)
        setOwnerAddress(wagmiAddress ?? null)
        setEcdsaValidator(result.ecdsaValidator)
        setIsAccountReady(true)

        console.log('🔐 [CONTEXT] Kernel account initialized:', result.address)
      } else if (walletSource === 'para-embedded') {
        const result = await initializePimlicoAccount({
          walletSource,
          paraClient,
          accountType,
        })

        setClient(result.client)
        setSession(null)
        setIsSessionClient(false)
        setAccountAddress(result.address)
        setAccountConfig(result.config)
        // For Para embedded wallets, use the EOA address from the Para account
        setOwnerAddress(result.eoaAddress ?? null)
        setEcdsaValidator(null)
        setIsAccountReady(true)

        console.log('🔐 [CONTEXT] Pimlico account initialized:', {
          smartAccount: result.address,
          eoaAddress: result.eoaAddress,
        })
      }

      initializedRef.current = key
    } catch (err) {
      console.error('[CONTEXT] Failed to initialize smart account:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
      setHasInitialized(true)
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
  // Must match balanceAddress to fund the same address we're checking
  const addressToFund = accountType === 'hca' ? ownerAddress : accountAddress

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

  const signer: Signer | null = useMemo(() => {
    if (!client || !accountAddress) return null

    const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
    if (!pimlicoApiKey) {
      console.error('Pimlico API key not configured - cannot create signer')
      return null
    }

    if (walletSource === 'external-wallet') {
      return {
        type: 'kernel' as const,
        account: client as KernelAccountClient,
        config: {
          chain: customSepolia,
          accountAddress,
          accountType: accountConfig?.accountType,
          pimlicoApiKey,
          isSessionClient,
        },
      }
    }

    return {
      type: 'pimlico' as const,
      account: client as SmartAccountClient,
      config: {
        chain: customSepolia,
        accountAddress,
        accountType: accountConfig?.accountType,
        pimlicoApiKey,
      },
    }
  }, [client, accountAddress, accountConfig, isSessionClient, walletSource])

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

  const openSessionModal = useCallback(() => {
    setShouldShowSessionModal(true)
  }, [])

  const clearSessionModalTrigger = useCallback(() => {
    setShouldShowSessionModal(false)
  }, [])

  const contextValue: SmartAccountContextValue = {
    type: 'kernel',
    client: client as KernelAccountClient | null,
    config: accountConfig as KernelConfig | null,
    accountAddress,
    isLoading,
    error,
    isConnected: isWalletReady && !!client,
    walletSource,
    ownerAddress,
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
    hasInitialized,
    setSessionData,
    openSessionModal,
    shouldShowSessionModal,
    clearSessionModalTrigger,
    walletClient: (wagmiWalletClient as WalletClient | undefined) ?? null,
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
