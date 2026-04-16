import type { SmartAccountConfig } from '@ens-apps/transaction-manager'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { KernelValidator } from '@zerodev/sdk'
import type { Address, WalletClient } from 'viem'
import { assign, type StateFrom, setup } from 'xstate'
import type { SessionProvider, TransactionInfra } from '@/utils/feature-flags'
import { getSessionProvider, getTransactionInfra } from '@/utils/feature-flags'
import {
  type AccountClient,
  type AccountInitResult,
  initializeAccountActor,
} from './actors/initialize-account.actor'
import {
  type CreateSessionInput,
  checkExistingSessionActor,
  createSessionActor,
  restoreSessionActor,
  type SessionClient,
} from './actors/session.actors'
import { setSkippedStatus } from './sessions/session-storage'
import type { StoredSession } from './sessions/types'
import type { ParaClient, SmartAccountType } from './types'

export type WalletSource = 'external-wallet' | 'para-embedded'

interface SmartAccountContext {
  readonly client: AccountClient | null
  readonly accountAddress: Address | null
  readonly ownerAddress: Address | null
  readonly config: SmartAccountConfig | null
  readonly ecdsaValidator: KernelValidator<'ECDSAValidator'> | null
  readonly walletSource: WalletSource | null
  readonly walletClient: WalletClient | null
  readonly paraClient: ParaClient | null
  readonly provider: SessionProvider
  readonly infrastructure: TransactionInfra
  readonly accountType: SmartAccountType
  readonly session: StoredSession | null
  readonly sessionClient: SessionClient | null
  readonly error: string | null
}

type WalletConnectedEvent =
  | {
      type: 'WALLET_CONNECTED'
      walletSource: 'external-wallet'
      walletClient: WalletClient
      paraClient?: never
    }
  | {
      type: 'WALLET_CONNECTED'
      walletSource: 'para-embedded'
      paraClient: ParaClient
      walletClient?: WalletClient
    }

type SmartAccountEvent =
  | WalletConnectedEvent
  | { type: 'WALLET_DISCONNECTED' }
  | { type: 'SET_ACCOUNT_TYPE'; accountType: SmartAccountType }
  | { type: 'PROMPT_SESSION' }
  | { type: 'ENABLE_SESSION' }
  | { type: 'DISMISS_SESSION' }

const INITIAL_CONTEXT: SmartAccountContext = {
  client: null,
  accountAddress: null,
  ownerAddress: null,
  config: null,
  ecdsaValidator: null,
  walletSource: null,
  walletClient: null,
  paraClient: null,
  provider: 'zerodev',
  infrastructure: 'pimlico',
  accountType: 'hca',
  session: null,
  sessionClient: null,
  error: null,
}

function getEventWalletAddress(
  event: WalletConnectedEvent,
): Address | undefined {
  if ('walletClient' in event && event.walletClient?.account?.address) {
    return event.walletClient.account.address
  }

  return undefined
}

function requireWalletSource(context: SmartAccountContext): WalletSource {
  if (!context.walletSource) {
    throw new Error('Wallet source is missing')
  }

  return context.walletSource
}

function requireOwnerAddress(context: SmartAccountContext): Address {
  if (!context.ownerAddress) {
    throw new Error('Owner address is missing')
  }

  return context.ownerAddress
}

function requireSession(context: SmartAccountContext): StoredSession {
  if (!context.session) {
    throw new Error('Session is missing')
  }

  return context.session
}

const logState = (state: string) =>
  ({ type: 'logTransition' as const, params: { state } }) as const

function requireCreateSessionInput(
  context: SmartAccountContext,
): CreateSessionInput {
  if (!context.ownerAddress) {
    throw new Error('Owner address is missing')
  }

  if (!context.accountAddress) {
    throw new Error('Account address is missing')
  }

  if (!context.config?.chain?.id) {
    throw new Error('Missing chain id in account config')
  }

  return {
    ownerAddress: context.ownerAddress,
    accountAddress: context.accountAddress,
    provider: context.provider,
    chainId: context.config.chain.id,
    ecdsaValidator: context.ecdsaValidator ?? undefined,
    // Rhinestone-specific: pass account client and chain for session enablement
    rhinestoneAccount:
      context.provider === 'rhinestone'
        ? (context.client as unknown as RhinestoneAccount)
        : undefined,
    chain: context.config.chain,
  }
}

export const smartAccountMachine = setup({
  types: {
    context: {} as SmartAccountContext,
    events: {} as SmartAccountEvent,
  },
  actors: {
    initializeAccount: fromResultAsync(initializeAccountActor),
    checkExistingSession: fromResultAsync(checkExistingSessionActor),
    createSession: fromResultAsync(createSessionActor),
    restoreSession: fromResultAsync(restoreSessionActor),
  },
  actions: {
    resetContext: assign(() => INITIAL_CONTEXT),
    persistSkippedSession: ({ context }) => {
      if (context.ownerAddress) {
        setSkippedStatus(context.ownerAddress, true)
      }
    },
    logTransition: ({ context }, params: { state: string }) => {
      console.log(`🔧 [SmartAccount] Entering state: ${params.state}`, {
        accountAddress: context.accountAddress,
        provider: context.provider,
        hasSession: !!context.session,
      })
    },
  },
  guards: {
    wasSkipped: ({ event }) => {
      if (!('output' in event)) return false
      const output = event.output as { wasSkipped?: boolean } | undefined
      return output?.wasSkipped ?? false
    },
    isParaEmbedded: ({ context }) => context.walletSource === 'para-embedded',
    isExternalWallet: ({ context }) =>
      context.walletSource === 'external-wallet',
  },
}).createMachine({
  id: 'smartAccount',
  initial: 'disconnected',
  context: INITIAL_CONTEXT,

  states: {
    disconnected: {
      entry: ['resetContext', logState('disconnected')],
      on: {
        WALLET_CONNECTED: {
          target: 'initializing',
          actions: assign(({ event }) => {
            const walletAddress = getEventWalletAddress(event)

            return {
              walletSource: event.walletSource,
              walletClient: event.walletClient ?? null,
              paraClient: 'paraClient' in event ? event.paraClient : null,
              provider: getSessionProvider(
                walletAddress ? { walletAddress } : undefined,
              ),
              infrastructure: getTransactionInfra(
                walletAddress ? { walletAddress } : undefined,
              ),
              error: null,
            }
          }),
        },
        SET_ACCOUNT_TYPE: {
          actions: assign(({ event }) => ({
            accountType: event.accountType,
          })),
        },
      },
    },

    initializing: {
      entry: [logState('initializing')],
      invoke: {
        src: 'initializeAccount',
        input: ({ context }) => ({
          walletSource: requireWalletSource(context),
          walletClient: context.walletClient ?? undefined,
          paraClient: context.paraClient ?? undefined,
          provider: context.provider,
          accountType: context.accountType,
          infrastructure: context.infrastructure,
        }),
        onDone: {
          target: 'checkingSession',
          actions: assign(({ event }) => {
            const output = event.output as AccountInitResult
            return {
              client: output.client,
              accountAddress: output.address,
              ownerAddress: output.ownerAddress,
              config: output.config,
              ecdsaValidator: output.ecdsaValidator,
              error: null,
            }
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : String(event.error),
          }),
        },
      },
    },

    checkingSession: {
      entry: [logState('checkingSession')],
      invoke: {
        src: 'checkExistingSession',
        input: ({ context }) => ({
          ownerAddress: requireOwnerAddress(context),
          provider: context.provider,
        }),
        onDone: [
          {
            guard: ({ event }) => !!event.output.session,
            target: 'restoringSession',
            actions: assign({
              session: ({ event }) => event.output.session,
              error: () => null,
            }),
          },
          { target: 'promptingSession' },
        ],
        onError: { target: 'promptingSession' },
      },
    },

    restoringSession: {
      entry: [logState('restoringSession')],
      invoke: {
        src: 'restoreSession',
        input: ({ context }) => ({
          session: requireSession(context),
          provider: context.provider,
        }),
        onDone: {
          target: 'ready',
          actions: assign({
            sessionClient: ({ event }) => event.output.sessionClient,
            error: () => null,
          }),
        },
        onError: {
          target: 'promptingSession',
          actions: assign({ session: () => null }),
        },
      },
    },

    promptingSession: {
      entry: [logState('promptingSession')],
      on: {
        ENABLE_SESSION: 'creatingSession',
        DISMISS_SESSION: {
          target: 'ready',
          actions: 'persistSkippedSession',
        },
        WALLET_DISCONNECTED: 'disconnected',
      },
    },

    creatingSession: {
      entry: [logState('creatingSession')],
      invoke: {
        src: 'createSession',
        input: ({ context }) => requireCreateSessionInput(context),
        onDone: {
          target: 'ready',
          actions: assign({
            session: ({ event }) => event.output.session,
            sessionClient: ({ event }) => event.output.sessionClient,
            error: () => null,
          }),
        },
        onError: {
          target: 'promptingSession',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : String(event.error),
          }),
        },
      },
    },

    ready: {
      entry: [logState('ready')],
      on: {
        WALLET_DISCONNECTED: 'disconnected',
        PROMPT_SESSION: {
          guard: 'isExternalWallet',
          target: 'promptingSession',
        },
      },
    },

    error: {
      entry: [logState('error')],
      on: {
        WALLET_DISCONNECTED: 'disconnected',
      },
    },
  },
})

export const selectIsLoading = (state: StateFrom<typeof smartAccountMachine>) =>
  state.value === 'initializing' ||
  state.value === 'checkingSession' ||
  state.value === 'restoringSession'

export const selectIsReady = (state: StateFrom<typeof smartAccountMachine>) =>
  state.value === 'ready'

export const selectShowSessionModal = (
  state: StateFrom<typeof smartAccountMachine>,
) => state.value === 'promptingSession'

export const selectIsCreatingSession = (
  state: StateFrom<typeof smartAccountMachine>,
) => state.value === 'creatingSession'
