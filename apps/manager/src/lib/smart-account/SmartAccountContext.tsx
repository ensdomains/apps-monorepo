'use client'

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
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { toast } from 'sonner'
import type { Address, WalletClient } from 'viem'
import { useWalletClient } from 'wagmi'
import type { EventFromLogic } from 'xstate'
import { customSepolia } from '@/lib/wagmi'
import { backendClient } from '@/utils/backend-client'
import { isFeatureEnabled } from '@/utils/feature-flags'
import { createParaOwnerWalletClient } from './rhinestone'
import {
  selectIsLoading,
  selectIsReady,
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
  readonly walletClient: WalletClient | null
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

  // In EOA-only mode the smart-account state machine never runs — skip the
  // wallet sync hook so we don't kick off Rhinestone initialization
  // (which would deploy the HCA via Warp etc.).
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

    // HCA signer: every Intent is signed by the account's ENS owner (the
    // connected wallet, held inside `baseClient`) and gas-sponsored through
    // the Rhinestone Warp orchestrator. There is no smart session — the HCA
    // permanently locks its module set, so a session validator can never be
    // installed.
    return {
      type: 'rhinestone' as const,
      account: baseClient as unknown as RhinestoneSigner['account'],
      config: {
        chain: customSepolia,
        accountAddress,
        rhinestoneApiKey,
        defaultInfra: 'warp',
      },
    }
  }, [baseClient, accountAddress, wagmiWalletClient])

  // EOA wallet client for the *owner* of the account, used for actions the
  // registrar attributes to the owner — notably the ERC-20 `approve`, which
  // the ENS registrar pulls from the owner EOA (the HCA can't approve on its
  // behalf). External wallets expose this through wagmi; embedded Para wallets
  // do not (Para is not a wagmi connector), so derive one from the Para client
  // — otherwise HCA registration silently falls back to the bundled
  // approve+register intent, which approves from the HCA and reverts.
  const ownerWalletClient = useMemo<WalletClient | null>(() => {
    if (wagmiWalletClient?.account?.address) {
      return wagmiWalletClient as WalletClient
    }
    if (snapshot.context.walletSource === 'para-embedded' && paraClient) {
      return createParaOwnerWalletClient(paraClient)
    }
    return null
  }, [wagmiWalletClient, paraClient, snapshot.context.walletSource])

  const isConnected = isFeatureEnabled('USE_EOA')
    ? !!wagmiWalletClient && !!eoaAddress
    : !!snapshot.context.walletSource && !!snapshot.context.client
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
        // zeroed out.
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
        isAccountReady,
        hasInitialized,
        isReady: isAccountReady,
        walletClient: (wagmiWalletClient as WalletClient | undefined) ?? null,
        infrastructure: 'warp',
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
        isAccountReady,
        hasInitialized,
        isReady,
        walletClient: ownerWalletClient,
        infrastructure,
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
