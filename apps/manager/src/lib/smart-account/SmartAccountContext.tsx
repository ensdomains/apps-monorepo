'use client'

import { buildRegistrationSessionActions } from '@ens-apps/smart-account'
import type { RhinestoneSigner, Signer } from '@ens-apps/transaction-manager'
import { logger } from '@ens-apps/utils/logger'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  useClient as useParaClient,
  useWallet as useParaWallet,
} from '@getpara/react-sdk-lite'
import { useLingui } from '@lingui/react/macro'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useActor, useSelector } from '@xstate/react'
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
import type { Address, Hex, WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { useWalletClient } from 'wagmi'
import type { EventFromLogic } from 'xstate'
import { customSepolia } from '@/lib/wagmi'
import { backendClient } from '@/utils/backend-client'
import { isFeatureEnabled } from '@/utils/feature-flags'
import {
  selectIsCreatingSession,
  selectIsLoading,
  selectIsReady,
  selectShowSessionModal,
  smartAccountMachine,
} from './smart-account.machine'
import type {
  WalletSource as BaseWalletSource,
  RhinestoneAccountState,
} from './types'
import { useSmartAccountBalances } from './useSmartAccountBalances'

export interface SmartAccountContextValue extends RhinestoneAccountState {
  readonly hasInitialized: boolean
  readonly isReady: boolean
  readonly isCreatingSession: boolean
  readonly showSessionModal: boolean
  readonly walletClient: WalletClient | null
  readonly enableSession: () => Promise<void>
  readonly dismissSession: () => void
  readonly promptSession: () => void
  readonly infrastructure: 'pimlico' | 'warp'
}

const SmartAccountContext = createContext<SmartAccountContextValue | null>(null)

interface SmartAccountContextProviderProps {
  readonly children: ReactNode
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

/**
 * Synchronizes wallet connection state with the smart account state machine.
 * Handles transitions between disconnected, external-wallet, and para-embedded states.
 */
function useWalletConnectionSync(
  paraWallet: ReturnType<typeof useParaWallet>['data'],
  wagmiWalletClient: WalletClient | undefined,
  paraClient: ReturnType<typeof useParaClient>,
  snapshotValue: string,
  send: (event: EventFromLogic<typeof smartAccountMachine>) => void,
) {
  const connectedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const walletSource = detectWalletSource(
      paraWallet,
      wagmiWalletClient,
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
      if (snapshotValue !== 'disconnected') {
        send({ type: 'WALLET_DISCONNECTED' })
      }
      return
    }

    if (connectedKeyRef.current === nextKey) {
      return
    }

    if (snapshotValue !== 'disconnected') {
      send({ type: 'WALLET_DISCONNECTED' })
      return
    }

    if (walletSource === 'external-wallet') {
      if (!wagmiWalletClient) return
      send({
        type: 'WALLET_CONNECTED',
        walletSource: 'external-wallet',
        walletClient: wagmiWalletClient,
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
  }, [paraWallet, wagmiWalletClient, paraClient, snapshotValue, send])
}

export const SmartAccountContextProvider = ({
  children,
}: SmartAccountContextProviderProps) => {
  const queryClient = useQueryClient()
  const { t } = useLingui()
  const paraClient = useParaClient()
  const { data: paraWallet, isPending: isParaWalletPending } = useParaWallet()
  const { data: wagmiWalletClient } = useWalletClient()

  const [snapshot, send, actorRef] = useActor(smartAccountMachine)

  const isLoading = useSelector(actorRef, selectIsLoading)
  const isReady = useSelector(actorRef, selectIsReady)
  const showSessionModal = useSelector(actorRef, selectShowSessionModal)
  const isCreatingSession = useSelector(actorRef, selectIsCreatingSession)

  // In EOA-only mode the smart-account state machine never runs — skip the
  // wallet sync hook so we don't kick off Rhinestone initialization
  // (which would trigger HCA registration via Warp etc.).
  const useEoa = isFeatureEnabled('USE_EOA')
  useWalletConnectionSync(
    useEoa ? undefined : paraWallet,
    useEoa ? undefined : (wagmiWalletClient as WalletClient | undefined),
    paraClient,
    snapshot.value as string,
    send,
  )

  const eoaAddress = wagmiWalletClient?.account?.address ?? null
  // In EOA-only mode the wagmi wallet client _is_ the account; otherwise pull
  // both addresses from the smart-account state machine.
  const accountAddress = useEoa ? eoaAddress : snapshot.context.accountAddress
  const ownerAddress = useEoa
    ? eoaAddress
    : (snapshot.context.ownerAddress ?? eoaAddress)

  const balances = useSmartAccountBalances({
    accountAddress,
    ownerAddress,
  })

  // Smart account is HCA-only: fund the EOA (which holds the ENS name and
  // stablecoins the smart account spends from). ETH for gas is sponsored
  // by Rhinestone, so the SCA itself doesn't need funding.
  const addressToFund = ownerAddress

  const autoFundingMutation = useMutation({
    mutationKey: $qk({
      $scope: 'wallet',
      $action: 'fund',
      address: accountAddress,
    }),
    mutationFn: async (address: Address) => {
      toast.loading(t`Funding wallet`, {
        description: t`Funding wallet ${address} with mock USDC & DAI tokens`,
        id: `fund-wallet-${address}`,
      })
      const response = await backendClient.wallet.fund.$post({
        json: { address },
      })
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      return response.json()
    },
    onSuccess: (data, address) => {
      if (!data || !data.txHash) {
        toast.dismiss(`fund-wallet-${address}`)
        return
      }
      toast.success(t`Wallet funded successfully`, {
        description: t`Wallet ${address} funded successfully`,
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
      toast.error(t`Failed to fund wallet`, {
        description: t`Failed to fund wallet: ${error.message}`,
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

  const baseClient = snapshot.context.client
  const sessionClient = snapshot.context.sessionClient
  const isSessionClient = !!sessionClient

  const infrastructure = snapshot.context.infrastructure

  const signer: Signer | null = useMemo(() => {
    // EOA-only mode: skip smart account machinery entirely and sign with the
    // wagmi wallet client directly. This is the only viable signer on the
    // tenderly fork where Pimlico/Rhinestone bundlers are unavailable.
    if (isFeatureEnabled('USE_EOA')) {
      if (!wagmiWalletClient || !wagmiWalletClient.account) return null
      return {
        type: 'eoa',
        walletClient: wagmiWalletClient as WalletClient,
      }
    }

    if (!baseClient || !accountAddress) return null

    const isLocalOrchestrator = !!import.meta.env.VITE_RHINESTONE_ENDPOINT_URL
    const rhinestoneApiKey =
      import.meta.env.VITE_RHINESTONE_API_KEY ||
      (isLocalOrchestrator ? 'local-dev' : undefined)
    if (!rhinestoneApiKey) {
      logger.error('Rhinestone API key not configured - cannot create signer')
      return null
    }
    // The session policy pins both `register.owner == SCA` and
    // `HCAFactory.setAccountOwner.eoa == EOA`. Without a known EOA we
    // cannot reproduce the actions baked into the enable signature, so
    // refuse to construct the signer rather than risk an
    // `InvalidSignature()` revert at orchestrator time.
    if (!ownerAddress) {
      logger.error('Rhinestone signer: missing EOA owner address')
      return null
    }

    const rhinestoneSessionClient = sessionClient as {
      sessionPrivateKey: Hex
      enableSignature: Hex
      hashesAndChainIds: string
      validAfter: number
      validUntil: number
    } | null

    // Deserialize hashesAndChainIds from localStorage format (string chainId → bigint)
    const deserializeHashes = (json: string) =>
      (JSON.parse(json) as { chainId: string; sessionDigest: Hex }[]).map(
        (h) => ({
          chainId: BigInt(h.chainId),
          sessionDigest: h.sessionDigest,
        }),
      )

    return {
      type: 'rhinestone' as const,
      account: baseClient as unknown as RhinestoneSigner['account'],
      config: {
        chain: customSepolia,
        accountAddress,
        rhinestoneApiKey,
        isSessionClient,
        ...(rhinestoneSessionClient && {
          sessionPrivateKey: rhinestoneSessionClient.sessionPrivateKey,
          sessionConfig: {
            signers: {
              type: 'experimental_session' as const,
              session: {
                owners: {
                  type: 'ecdsa' as const,
                  accounts: [
                    privateKeyToAccount(
                      rhinestoneSessionClient.sessionPrivateKey,
                    ),
                  ],
                },
                chain: customSepolia,
                // Must match the actions (including the per-action
                // `time-frame` policy) baked into the EIP-712 enable
                // signature produced in @ens-apps/smart-account at session
                // creation time. Any divergence breaks the PermissionId
                // and yields `InvalidSignature()`.
                actions: buildRegistrationSessionActions({
                  smartAccountAddress: accountAddress,
                  eoaAddress: ownerAddress,
                  validAfter: rhinestoneSessionClient.validAfter,
                  validUntil: rhinestoneSessionClient.validUntil,
                }),
              },
              enableData: {
                userSignature: rhinestoneSessionClient.enableSignature,
                hashesAndChainIds: deserializeHashes(
                  rhinestoneSessionClient.hashesAndChainIds,
                ),
                sessionToEnableIndex: 0,
              },
            },
          } as unknown as RhinestoneSigner['config']['sessionConfig'],
        }),
        defaultInfra: infrastructure,
      },
    }
  }, [
    baseClient,
    sessionClient,
    accountAddress,
    ownerAddress,
    isSessionClient,
    infrastructure,
    wagmiWalletClient,
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

  const isConnected = isFeatureEnabled('USE_EOA')
    ? !!wagmiWalletClient && !!eoaAddress
    : !!snapshot.context.walletSource &&
      !!(snapshot.context.sessionClient ?? snapshot.context.client)
  const hasInitialized = isFeatureEnabled('USE_EOA')
    ? !isParaWalletPending
    : !isParaWalletPending && snapshot.value !== 'initializing'
  const isAccountReady = isFeatureEnabled('USE_EOA')
    ? !!eoaAddress
    : !!snapshot.context.client && !!snapshot.context.accountAddress

  const contextValue: SmartAccountContextValue = isFeatureEnabled('USE_EOA')
    ? {
        // In EOA-only mode the wagmi wallet client is both the EOA and the
        // "smart account" address. All smart-account-specific fields are
        // zeroed out; the session prompt is suppressed.
        type: 'rhinestone',
        client: null,
        config: null,
        accountAddress: eoaAddress,
        isLoading: false,
        error: null,
        isConnected,
        walletSource: eoaAddress ? 'external-wallet' : null,
        ownerAddress: eoaAddress,
        stablecoinBalances: balances.stablecoinBalances,
        isLoadingBalances: balances.isLoadingBalances,
        smartAccountEthBalance: balances.smartAccountEthBalance,
        isLoadingSmartAccountEth: balances.isLoadingSmartAccountEth,
        autoFundingMutation,
        signer,
        session: null,
        isSessionClient: false,
        isAccountReady,
        hasInitialized,
        showSessionModal: false,
        isReady: isAccountReady,
        isCreatingSession: false,
        walletClient: (wagmiWalletClient as WalletClient | undefined) ?? null,
        enableSession: async () => {},
        dismissSession: () => {},
        promptSession: () => {},
        infrastructure: 'pimlico',
      }
    : {
        type: 'rhinestone',
        client:
          (snapshot.context.client as RhinestoneAccountState['client']) ?? null,
        config:
          (snapshot.context.config as RhinestoneAccountState['config']) ?? null,
        accountAddress: snapshot.context.accountAddress,
        isLoading,
        error: snapshot.context.error,
        isConnected,
        walletSource: snapshot.context.walletSource as BaseWalletSource,
        ownerAddress,
        stablecoinBalances: balances.stablecoinBalances,
        isLoadingBalances: balances.isLoadingBalances,
        smartAccountEthBalance: balances.smartAccountEthBalance,
        isLoadingSmartAccountEth: balances.isLoadingSmartAccountEth,
        autoFundingMutation,
        signer,
        session: snapshot.context.session,
        isSessionClient,
        isAccountReady,
        hasInitialized,
        showSessionModal,
        isReady,
        isCreatingSession,
        walletClient: (wagmiWalletClient as WalletClient | undefined) ?? null,
        enableSession,
        dismissSession,
        promptSession,
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
