import type { WalletClient } from 'viem'
import type { Connector } from 'wagmi'
import {
  and,
  assertEvent,
  assign,
  fromCallback,
  fromPromise,
  not,
  raise,
  setup,
  stateIn,
} from 'xstate'
import type { SmartAccountContextValue } from '@/lib/smart-account'
import {
  type ConnectionOutcome,
  WALLETCONNECT_ID,
} from '@/lib/wallet/stacks/custom/connect.helpers'

type WalletConnectionEvent =
  | { readonly type: 'AUTH_CHANGED'; readonly isSignInNeeded: boolean }
  | { readonly type: 'ACCOUNT_UPDATED'; readonly isAccountSettled: boolean }
  | { readonly type: 'OPEN' }
  | { readonly type: 'DISMISS' }
  | { readonly type: 'CONNECT'; readonly connector: Connector }
  | { readonly type: 'CONNECTED'; readonly isReconnected: boolean }
  | { readonly type: 'DISCONNECTED' }
  | {
      readonly type: 'CONNECTION_CHANGED'
      readonly isConnected: boolean
      readonly isReconnected: boolean
    }
  | { readonly type: 'CONNECT_FINISHED'; readonly outcome: ConnectionOutcome }
  | { readonly type: 'SIGN_IN'; readonly walletClient: WalletClient }
  | { readonly type: 'CONFIRM_SKIP' }
  | { readonly type: 'SKIP' }

export const isSmartAccountSettled = (
  account: Pick<SmartAccountContextValue, 'isAccountReady' | 'error'> | null,
): boolean =>
  account === null || account.isAccountReady || Boolean(account.error)

export const walletConnectionMachine = setup({
  types: {
    context: {} as {
      readonly isConnected: boolean
      readonly isSignInNeeded: boolean
      readonly isAccountSettled: boolean
      readonly entry: 'connect' | 'session'
      readonly pendingConnectorId: string | undefined
      readonly connectionError: string | undefined
    },
    input: {} as { readonly isAccountSettled: boolean },
    events: {} as WalletConnectionEvent,
  },
  actors: {
    observeAuth: fromCallback<WalletConnectionEvent>(() => {}),
    observeConnection: fromCallback<WalletConnectionEvent>(() => {}),
    connect: fromPromise<ConnectionOutcome, Connector>(async () => ({
      status: 'connected',
    })),
    signIn: fromPromise<void, WalletClient>(async () => {}),
  },
  actions: {
    dismissAuth: () => {},
    reportSignInError: (_, _params: { readonly error: unknown }) => {},
  },
  guards: {
    needsSession: ({ context }) =>
      context.isConnected && context.isSignInNeeded && context.isAccountSettled,
    authFinished: ({ context }) =>
      !context.isConnected || !context.isSignInNeeded,
    canConnect: stateIn({ dialog: 'choosing', connection: 'idle' }),
    ownsConnection: stateIn({ connection: { pending: 'owned' } }),
    usesOwnModal: ({ event }) =>
      event.type === 'CONNECT' && event.connector.id === WALLETCONNECT_ID,
    canSignIn: ({ context }) => context.isAccountSettled,
    isReconnection: ({ event }) =>
      event.type === 'CONNECTED' && event.isReconnected,
  },
}).createMachine({
  id: 'walletConnection',
  type: 'parallel',
  context: ({ input }) => ({
    ...input,
    isConnected: false,
    isSignInNeeded: false,
    entry: 'session',
    pendingConnectorId: undefined,
    connectionError: undefined,
  }),
  invoke: [{ src: 'observeAuth' }, { src: 'observeConnection' }],
  on: {
    AUTH_CHANGED: {
      actions: assign({ isSignInNeeded: ({ event }) => event.isSignInNeeded }),
    },
    ACCOUNT_UPDATED: {
      actions: assign({
        isAccountSettled: ({ event }) => event.isAccountSettled,
      }),
    },
    CONNECTION_CHANGED: {
      actions: [
        assign({ isConnected: ({ event }) => event.isConnected }),
        raise(({ event }) =>
          event.isConnected
            ? { type: 'CONNECTED', isReconnected: event.isReconnected }
            : { type: 'DISCONNECTED' },
        ),
      ],
    },
  },
  states: {
    // The request outlives dialog transitions, including dismissal and WalletConnect hand-off.
    connection: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            CONNECT: {
              guard: 'canConnect',
              target: 'pending',
              actions: assign({
                pendingConnectorId: ({ event }) => event.connector.uid,
                connectionError: undefined,
              }),
            },
          },
        },
        pending: {
          initial: 'owned',
          invoke: {
            src: 'connect',
            input: ({ event }) => {
              assertEvent(event, 'CONNECT')
              return event.connector
            },
            onDone: [
              {
                guard: 'ownsConnection',
                target: 'idle',
                actions: [
                  assign({
                    connectionError: ({ event }) =>
                      event.output.status === 'connected'
                        ? undefined
                        : event.output.message,
                  }),
                  raise(({ event }) => ({
                    type: 'CONNECT_FINISHED',
                    outcome: event.output,
                  })),
                ],
              },
              { target: 'idle' },
            ],
          },
          exit: assign({ pendingConnectorId: undefined }),
          on: { DISCONNECTED: '.detached' },
          states: { owned: {}, detached: {} },
        },
      },
    },
    dialog: {
      initial: 'closed',
      on: { DISCONNECTED: '.closed' },
      states: {
        closed: {
          always: {
            guard: 'needsSession',
            target: 'signIn',
            actions: assign({ entry: 'session' }),
          },
          on: {
            OPEN: {
              target: 'choosing',
              actions: assign({ entry: 'connect', connectionError: undefined }),
            },
          },
        },
        choosing: {
          tags: ['open'],
          on: {
            DISMISS: 'closed',
            CONNECT: {
              guard: and(['canConnect', 'usesOwnModal']),
              target: 'pairing',
            },
            CONNECTED: [
              { guard: 'isReconnection', target: 'closed' },
              { guard: 'ownsConnection', target: 'signIn' },
              { target: 'closed' },
            ],
            CONNECT_FINISHED: {
              guard: ({ event }) => event.outcome.status === 'connected',
              target: 'signIn',
            },
          },
        },
        pairing: {
          on: {
            OPEN: 'choosing',
            CONNECTED: [
              { guard: 'isReconnection', target: 'closed' },
              { guard: 'ownsConnection', target: 'signIn' },
              { target: 'closed' },
            ],
            CONNECT_FINISHED: [
              {
                guard: ({ event }) => event.outcome.status === 'connected',
                target: 'signIn',
              },
              {
                guard: ({ event }) => event.outcome.status === 'cancelled',
                target: 'closed',
              },
              { target: 'choosing' },
            ],
          },
        },
        signIn: {
          tags: ['open', 'auth'],
          initial: 'ready',
          always: { guard: 'authFinished', target: 'closed' },
          on: {
            SKIP: {
              guard: not(stateIn({ dialog: { signIn: 'signing' } })),
              actions: 'dismissAuth',
            },
          },
          states: {
            ready: {
              on: { SIGN_IN: { guard: 'canSignIn', target: 'signing' } },
            },
            signing: {
              tags: ['signing'],
              invoke: {
                src: 'signIn',
                input: ({ event }) => {
                  assertEvent(event, 'SIGN_IN')
                  return event.walletClient
                },
                onDone: 'ready',
                onError: {
                  target: 'failed',
                  actions: {
                    type: 'reportSignInError',
                    params: ({ event }) => ({ error: event.error }),
                  },
                },
              },
            },
            failed: {
              tags: ['signInError'],
              on: {
                SIGN_IN: { guard: 'canSignIn', target: 'signing' },
                CONFIRM_SKIP: 'confirmSkip',
              },
            },
            confirmSkip: {
              tags: ['confirmSkip'],
              on: { SIGN_IN: { guard: 'canSignIn', target: 'signing' } },
            },
          },
        },
      },
    },
  },
})
