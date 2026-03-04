'use client'

import type { RhinestoneSigner, Signer } from '@ens-apps/transaction-manager'
import { logger } from '@ens-apps/utils/logger'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  useClient as useParaClient,
  useWallet as useParaWallet,
} from '@getpara/react-sdk-lite'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useActor, useSelector } from '@xstate/react'
import type { KernelAccountClient } from '@zerodev/sdk'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { toast } from 'sonner'
import type { Address, WalletClient } from 'viem'
import { useWalletClient } from 'wagmi'
import { customSepolia } from '@/lib/wagmi'
import { backendClient } from '@/utils/backend-client'
import {
  selectIsCreatingSession,
  selectIsLoading,
  selectIsReady,
  selectShowSessionModal,
  smartAccountMachine,
} from './smart-account.machine'
import type {
  WalletSource as BaseWalletSource,
  ZeroDevAccountState,
} from './types'
import { useSmartAccountBalances } from './useSmartAccountBalances'

interface SmartAccountContextValue extends ZeroDevAccountState {
  readonly hasInitialized: boolean
  readonly isReady: boolean
  readonly isCreatingSession: boolean
  readonly showSessionModal: boolean
  readonly walletClient: WalletClient | null
  readonly enableSession: () => Promise<void>
  readonly dismissSession: () => void
  readonly promptSession: () => void
  readonly provider: 'zerodev' | 'rhinestone'
  readonly infrastructure: 'pimlico' | 'warp'
}

const SmartAccountContext = createContext<SmartAccountContextValue | null>(null)

interface SmartAccountContextProviderProps {
  readonly children: ReactNode
  readonly accountType?: 'simple' | 'hca'
}

function detectWalletSource(
  paraWallet: ReturnType<typeof useParaWallet>['data'],
  wagmiWalletClient: WalletClient | undefined,
  paraClient: ReturnType<typeof useParaClient>,
): BaseWalletSource {
  const wagmiAddress = wagmiWalletClient?.account?.address
  const hasWagmi = !!wagmiAddress
  const hasPara = !paraWallet?.isExternal && !!paraWallet && !!paraClient

  if (paraWallet?.isExternal && hasWagmi) {
    return 'external-wallet'
  }

  if (hasPara) {
    return 'para-embedded'
  }

  return null
}

export const SmartAccountContextProvider = ({
  children,
  accountType = 'hca',
}: SmartAccountContextProviderProps) => {
  const queryClient = useQueryClient()
  const paraClient = useParaClient()
  const { data: paraWallet, isPending: isParaWalletPending } = useParaWallet()
  const { data: wagmiWalletClient } = useWalletClient()

  const [snapshot, send, actorRef] = useActor(smartAccountMachine)

  const isLoading = useSelector(actorRef, selectIsLoading)
  const isReady = useSelector(actorRef, selectIsReady)
  const showSessionModal = useSelector(actorRef, selectShowSessionModal)
  const isCreatingSession = useSelector(actorRef, selectIsCreatingSession)

  const connectedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    send({ type: 'SET_ACCOUNT_TYPE', accountType })
  }, [accountType, send])

  useEffect(() => {
    const walletSource = detectWalletSource(
      paraWallet,
      wagmiWalletClient as WalletClient | undefined,
      paraClient,
    )

    const nextKey =
      walletSource === 'external-wallet'
        ? `external-${wagmiWalletClient?.account?.address?.toLowerCase() ?? 'unknown'}`
        : walletSource === 'para-embedded'
          ? 'para-embedded'
          : null

    if (!walletSource || !nextKey) {
      connectedKeyRef.current = null
      if (snapshot.value !== 'disconnected') {
        send({ type: 'WALLET_DISCONNECTED' })
      }
      return
    }

    if (connectedKeyRef.current === nextKey) {
      return
    }

    if (snapshot.value !== 'disconnected') {
      send({ type: 'WALLET_DISCONNECTED' })
      return
    }

    if (walletSource === 'external-wallet') {
      if (!wagmiWalletClient) return
      send({
        type: 'WALLET_CONNECTED',
        walletSource: 'external-wallet',
        walletClient: wagmiWalletClient as WalletClient,
      })
      connectedKeyRef.current = nextKey
      return
    }

    if (walletSource === 'para-embedded' && paraClient) {
      send({
        type: 'WALLET_CONNECTED',
        walletSource: 'para-embedded',
        paraClient,
      })
      connectedKeyRef.current = nextKey
      return
    }

    connectedKeyRef.current = nextKey
  }, [paraWallet, wagmiWalletClient, paraClient, snapshot.value, send])

  const accountAddress = snapshot.context.accountAddress
  const ownerAddress = snapshot.context.ownerAddress

  const balances = useSmartAccountBalances({
    accountAddress,
    ownerAddress,
    accountType,
  })

  const addressToFund = accountType === 'hca' ? ownerAddress : accountAddress

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
    onSuccess: (data, address) => {
      if (!data || (!data.usdcTxHash && !data.daiTxHash)) {
        toast.dismiss(`fund-wallet-${address}`)
        return
      }
      toast.success('Wallet funded successfully', {
        description: `Wallet ${address} funded successfully`,
        id: `fund-wallet-${address}`,
      })
      queryClient.invalidateQueries({
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

  const { isIdle: isFundingIdle, mutate: fundWallet } = autoFundingMutation

  useEffect(() => {
    if (
      !addressToFund ||
      isLoading ||
      balances.isLoadingBalances ||
      !isFundingIdle
    ) {
      return
    }

    const totalBalance = balances.stablecoinBalances.reduce(
      (acc, balance) =>
        acc + BigInt(balance.balance) / BigInt(10 ** balance.decimals),
      0n,
    )

    if (totalBalance >= 500n) return

    fundWallet(addressToFund)
  }, [
    addressToFund,
    isLoading,
    balances.isLoadingBalances,
    balances.stablecoinBalances,
    isFundingIdle,
    fundWallet,
  ])

  const isSessionClient = !!snapshot.context.sessionClient

  const provider = snapshot.context.provider
  const infrastructure = snapshot.context.infrastructure

  const signer: Signer | null = useMemo(() => {
    const { client: baseClient, sessionClient } = snapshot.context
    if (!baseClient || !accountAddress) return null

    if (provider === 'rhinestone') {
      const rhinestoneApiKey = import.meta.env.VITE_RHINESTONE_API_KEY
      if (!rhinestoneApiKey) {
        logger.error('Rhinestone API key not configured - cannot create signer')
        return null
      }

      const rhinestoneSessionClient = sessionClient as {
        sessionConfig: Record<string, unknown>
        sessionPrivateKey: `0x${string}`
      } | null

      return {
        type: 'rhinestone' as const,
        account: baseClient as unknown as RhinestoneSigner['account'],
        config: {
          chain: customSepolia,
          accountAddress,
          accountType,
          rhinestoneApiKey,
          isSessionClient,
          ...(rhinestoneSessionClient && {
            sessionPrivateKey: rhinestoneSessionClient.sessionPrivateKey,
            sessionConfig:
              rhinestoneSessionClient.sessionConfig as RhinestoneSigner['config']['sessionConfig'],
          }),
          defaultInfra: infrastructure,
        },
      }
    }

    const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
    if (!pimlicoApiKey) {
      logger.error('Pimlico API key not configured - cannot create signer')
      return null
    }

    const client = sessionClient ?? baseClient
    return {
      type: 'zerodev' as const,
      account: client as KernelAccountClient,
      config: {
        chain: customSepolia,
        accountAddress,
        accountType,
        pimlicoApiKey,
        isSessionClient,
      },
    }
  }, [
    snapshot.context.client,
    snapshot.context.sessionClient,
    accountAddress,
    accountType,
    isSessionClient,
    provider,
    infrastructure,
  ])

  const promptSession = useCallback(() => {
    send({ type: 'PROMPT_SESSION' })
  }, [send])

  const dismissSession = useCallback(() => {
    send({ type: 'DISMISS_SESSION' })
  }, [send])

  const enableSession = useCallback(async () => {
    const current = actorRef.getSnapshot()
    if (current.value !== 'promptingSession') {
      throw new Error('Session can only be enabled from prompting state')
    }

    await new Promise<void>((resolve, reject) => {
      let sawCreating = false
      const subscription = actorRef.subscribe((nextSnapshot) => {
        if (nextSnapshot.value === 'creatingSession') {
          sawCreating = true
          return
        }

        if (!sawCreating) return

        subscription.unsubscribe()
        if (nextSnapshot.context.sessionClient) {
          resolve()
          return
        }
        reject(
          new Error(nextSnapshot.context.error ?? 'Failed to create session'),
        )
      })

      send({ type: 'ENABLE_SESSION' })
    })
  }, [actorRef, send])

  const isConnected =
    !!snapshot.context.walletSource &&
    !!(snapshot.context.sessionClient ?? snapshot.context.client)
  const hasInitialized =
    !isParaWalletPending && snapshot.value !== 'initializing'
  const isAccountReady =
    !!snapshot.context.client && !!snapshot.context.accountAddress

  const contextValue: SmartAccountContextValue = {
    type: 'zerodev',
    client: (snapshot.context.sessionClient ??
      snapshot.context.client) as KernelAccountClient | null,
    config: snapshot.context.config as ZeroDevAccountState['config'],
    accountAddress: snapshot.context.accountAddress,
    isLoading,
    error: snapshot.context.error,
    isConnected,
    walletSource: snapshot.context.walletSource as BaseWalletSource,
    ownerAddress: snapshot.context.ownerAddress,
    stablecoinBalances: balances.stablecoinBalances,
    isLoadingBalances: balances.isLoadingBalances,
    smartAccountEthBalance: balances.smartAccountEthBalance,
    isLoadingSmartAccountEth: balances.isLoadingSmartAccountEth,
    autoFundingMutation,
    signer,
    session: snapshot.context.session,
    isSessionClient,
    ecdsaValidator: snapshot.context.ecdsaValidator,
    isAccountReady,
    hasInitialized,
    showSessionModal,
    isReady,
    isCreatingSession,
    walletClient: (wagmiWalletClient as WalletClient | undefined) ?? null,
    enableSession,
    dismissSession,
    promptSession,
    provider: snapshot.context.provider,
    infrastructure: snapshot.context.infrastructure,
  }

  return (
    <SmartAccountContext.Provider value={contextValue}>
      {children}
    </SmartAccountContext.Provider>
  )
}

export function useSmartAccountContext(): SmartAccountContextValue {
  const context = useContext(SmartAccountContext)
  if (!context) {
    throw new Error(
      'useSmartAccountContext must be used within SmartAccountProvider',
    )
  }
  return context
}

export function useSmartAccountContextSafe(): SmartAccountContextValue | null {
  return useContext(SmartAccountContext)
}
