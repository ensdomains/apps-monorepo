'use client'

import type { RhinestoneSigner, Signer } from '@ens-apps/transaction-manager'
import { logger } from '@ens-apps/utils/logger'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
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
import { useConnection, useWalletClient } from 'wagmi'
import type { EventFromLogic } from 'xstate'
import { customSepolia } from '@/lib/wagmi'
import { backendClient } from '@/utils/backend-client'
import { isFeatureEnabled } from '@/utils/feature-flags'
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
  readonly infrastructure: 'warp'
}

const SmartAccountContext = createContext<SmartAccountContextValue | null>(null)

interface SmartAccountContextProviderProps {
  readonly children: ReactNode
}

function detectWalletSource(
  wagmiWalletClient: WalletClient | undefined,
): BaseWalletSource {
  return wagmiWalletClient?.account?.address ? 'external-wallet' : null
}

/**
 * Synchronizes wallet connection state with the smart account state machine.
 * Handles transitions between disconnected and external-wallet states.
 */
function useWalletConnectionSync(
  wagmiWalletClient: WalletClient | undefined,
  snapshotValue: string,
  send: (event: EventFromLogic<typeof smartAccountMachine>) => void,
) {
  const connectedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const walletSource = detectWalletSource(wagmiWalletClient)

    const nextKey =
      walletSource === 'external-wallet'
        ? `external-${wagmiWalletClient?.account?.address?.toLowerCase() ?? 'unknown'}`
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

    if (!wagmiWalletClient) return
    send({
      type: 'WALLET_CONNECTED',
      walletSource: 'external-wallet',
      walletClient: wagmiWalletClient,
    })
    connectedKeyRef.current = nextKey
  }, [wagmiWalletClient, snapshotValue, send])
}

export const SmartAccountContextProvider = ({
  children,
}: SmartAccountContextProviderProps) => {
  const queryClient = useQueryClient()
  const { t } = useLingui()
  const { isConnecting, isReconnecting } = useConnection()
  const { data: wagmiWalletClient } = useWalletClient()

  // True while the connector is still establishing/restoring a session, so
  // we don't report the account as "initialized" mid-reconnect.
  const isWalletPending = isConnecting || isReconnecting

  const [snapshot, send, actorRef] = useActor(smartAccountMachine)

  const isLoading = useSelector(actorRef, selectIsLoading)
  const isReady = useSelector(actorRef, selectIsReady)

  // In EOA-only mode the smart-account state machine never runs — skip the
  // wallet sync hook so we don't kick off Rhinestone initialization
  // (which would deploy the HCA via Warp etc.).
  const useEoa = isFeatureEnabled('USE_EOA')
  useWalletConnectionSync(
    useEoa ? undefined : (wagmiWalletClient as WalletClient | undefined),
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

  // The (address + balance read) we last kicked off a fund for. We fund at most
  // ONCE per balance read: `balancesUpdatedAt` advances only on a genuine
  // refetch (every 30s, or the post-success invalidation) — never on render or
  // mutation-settle churn — so this both retries transient failures on the next
  // refetch AND can't loop on every render. This is what stops the previous
  // infinite loop / faucet+Para spam.
  const lastFundedKeyRef = useRef<string | null>(null)

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
      if (!data?.txHash) {
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
      // Intentionally keep the latch set for this snapshot. A failed attempt
      // is NOT retried until the balances are genuinely re-read (the 30s
      // refetch produces a new snapshot → new key → one retry). Resetting the
      // latch here would let the effect re-fire the instant `isPending` flips
      // back to false, hammering the faucet (and Para) on persistent errors.
    },
  })

  const { isPending: isFundingPending, mutate: fundWallet } =
    autoFundingMutation

  // Whether the owner is low on stablecoins. Computed here (not inside the
  // effect) and reduced to a stable *boolean* so the funding effect doesn't
  // re-run on the balances array's per-render ref churn — only when the
  // low/healthy verdict actually flips. Sum in whole-token units with exact
  // bigint powers (`10n ** decimals`, not `BigInt(10 ** decimals)`) so
  // 18-decimal DAI never goes through a lossy float.
  const needsStablecoins = useMemo(() => {
    const totalBalance = balances.stablecoinBalances.reduce(
      (acc, balance) =>
        acc + BigInt(balance.balance) / 10n ** BigInt(balance.decimals),
      0n,
    )
    return totalBalance < 500n
  }, [balances.stablecoinBalances])

  useEffect(() => {
    // NOTE: deliberately NOT gated on the smart-account machine's `isLoading`.
    // Funding tops up the EOA owner's stablecoins, which is independent of HCA
    // initialization. The machine can flap disconnected→initializing→ready
    // (Para reconnects, etc.); gating on `isLoading` there meant funding never
    // got a stable window and the EOA stayed at $0. We only need the owner
    // address and a loaded balance read.
    if (
      !addressToFund ||
      balances.isLoadingBalances ||
      // A fund is already in flight — wait for it to settle before deciding
      // whether another is needed.
      isFundingPending
    ) {
      return
    }

    // Fund when the owner is low on stablecoins. The api-worker faucet mints
    // mock USDC/DAI as needed; gated on a low balance so this stays idempotent.
    // (HCA gas is Warp-sponsored and the payment approval is a gasless permit,
    // so the EOA owner never needs native ETH.)
    if (!needsStablecoins) return

    // Fund at most once per distinct (address, balance read). The key only
    // changes when the owner address changes or the balances are genuinely
    // re-read (`balancesUpdatedAt` advances on refetch), so render churn and the
    // in-flight mutation can't re-fire it — while a persistent low balance still
    // retries on the next 30s refetch.
    const fundKey = `${addressToFund}:${balances.balancesUpdatedAt}`
    if (lastFundedKeyRef.current === fundKey) return

    lastFundedKeyRef.current = fundKey
    fundWallet(addressToFund)
  }, [
    addressToFund,
    balances.isLoadingBalances,
    balances.balancesUpdatedAt,
    needsStablecoins,
    isFundingPending,
    fundWallet,
  ])

  const baseClient = snapshot.context.client
  const infrastructure = snapshot.context.infrastructure

  const signer: Signer | null = useMemo(() => {
    // EOA-only mode: skip smart account machinery entirely and sign with the
    // wagmi wallet client directly. This is the only viable signer on the
    // tenderly fork where the Rhinestone relayer is unavailable.
    if (isFeatureEnabled('USE_EOA')) {
      if (!wagmiWalletClient?.account) return null
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

  const isConnected = isFeatureEnabled('USE_EOA')
    ? !!wagmiWalletClient && !!eoaAddress
    : !!snapshot.context.walletSource && !!snapshot.context.client
  const hasInitialized = isFeatureEnabled('USE_EOA')
    ? !isWalletPending
    : !isWalletPending && snapshot.value !== 'initializing'
  const isAccountReady = isFeatureEnabled('USE_EOA')
    ? !!eoaAddress
    : !!snapshot.context.client && !!snapshot.context.accountAddress

  // Memoized so the provider only emits a new value when something it exposes
  // actually changes. Without this the object is rebuilt on every render — the
  // 30s balance polls, the funding mutation and the XState snapshot all churn
  // it — which re-renders every consumer (including the routed `Outlet`) and
  // races TanStack Router's match state during navigation (the `MatchInnerImpl`
  // `throw undefined` that blanks the page). react-query already returns stable
  // refs for unchanged data, so the deps stay stable across no-op renders.
  const contextValue = useMemo<SmartAccountContextValue>(
    () =>
      useEoa
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
            walletClient:
              (wagmiWalletClient as WalletClient | undefined) ?? null,
            infrastructure: 'warp',
          }
        : {
            type: 'rhinestone',
            client:
              (snapshot.context.client as RhinestoneAccountState['client']) ??
              null,
            config:
              (snapshot.context.config as RhinestoneAccountState['config']) ??
              null,
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
            walletClient:
              (wagmiWalletClient as WalletClient | undefined) ?? null,
            infrastructure,
          },
    [
      useEoa,
      eoaAddress,
      ownerAddress,
      isConnected,
      isAccountReady,
      hasInitialized,
      isReady,
      isLoading,
      signer,
      autoFundingMutation,
      wagmiWalletClient,
      balances.stablecoinBalances,
      balances.isLoadingBalances,
      balances.smartAccountEthBalance,
      balances.isLoadingSmartAccountEth,
      snapshot.context.client,
      snapshot.context.config,
      snapshot.context.accountAddress,
      snapshot.context.error,
      snapshot.context.walletSource,
      infrastructure,
    ],
  )

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
