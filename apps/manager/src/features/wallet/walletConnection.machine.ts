import { and, assertEvent, assign, setup } from 'xstate'
import type { SmartAccountContextValue } from '@/lib/smart-account'
import type { ConnectionOutcome } from '@/lib/wallet/stacks/custom/connect.helpers'

export type WalletSession = {
  readonly isConnected: boolean
  readonly isSignInNeeded: boolean
  readonly isAccountSettled: boolean
  readonly isSigning: boolean
  readonly hasSignInError: boolean
}

// Detached requests still block concurrent connections but cannot advance a reopened dialog.
type Connection =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' | 'detached'; readonly connectorId: string }
  | { readonly status: 'failed'; readonly message: string }

type WalletConnectionEvent =
  | { readonly type: 'SESSION_UPDATED'; readonly session: WalletSession }
  | { readonly type: 'OPEN' }
  | { readonly type: 'DISMISS' }
  | {
      readonly type: 'CONNECT'
      readonly connectorId: string
      readonly usesOwnModal: boolean
    }
  | { readonly type: 'CONNECTED'; readonly isReconnected: boolean }
  | { readonly type: 'DISCONNECTED' }
  | {
      readonly type: 'CONNECT_RESULT'
      readonly outcome: ConnectionOutcome
      readonly usesOwnModal: boolean
    }
  | { readonly type: 'SIGN_IN' }
  | { readonly type: 'CONFIRM_SKIP' }
  | { readonly type: 'SKIP' }

export const isSmartAccountSettled = (
  account: Pick<SmartAccountContextValue, 'isAccountReady' | 'error'> | null,
): boolean =>
  account === null || account.isAccountReady || Boolean(account.error)

export const walletConnectionMachine = setup({
  types: {
    context: {} as {
      readonly session: WalletSession
      readonly entry: 'connect' | 'session'
      readonly connection: Connection
    },
    input: {} as WalletSession,
    events: {} as WalletConnectionEvent,
  },
  actions: {
    dismissAuth: () => {},
    detachConnection: assign({
      connection: ({ context }) =>
        context.connection.status === 'pending'
          ? ({ ...context.connection, status: 'detached' } as const)
          : context.connection,
    }),
    markConnected: assign({
      session: ({ context }) => ({ ...context.session, isConnected: true }),
    }),
    recordConnection: assign({
      connection: ({ event }) => {
        assertEvent(event, 'CONNECT_RESULT')
        if (
          event.outcome.status === 'connected' ||
          (event.usesOwnModal && event.outcome.status === 'cancelled')
        )
          return { status: 'idle' } as const
        return { status: 'failed', message: event.outcome.message } as const
      },
    }),
    startConnection: assign({
      connection: ({ event }) => {
        assertEvent(event, 'CONNECT')
        return { status: 'pending', connectorId: event.connectorId } as const
      },
    }),
    clearConnectionError: assign({
      connection: ({ context }) =>
        'connectorId' in context.connection
          ? context.connection
          : ({ status: 'idle' } as const),
    }),
    skip: assign({
      session: ({ context }) => ({ ...context.session, isSignInNeeded: false }),
    }),
  },
  guards: {
    needsSession: ({ context: { session } }) =>
      session.isConnected && session.isSignInNeeded && session.isAccountSettled,
    authFinished: ({ context: { session } }) =>
      !session.isConnected || !session.isSignInNeeded,
    canSkip: ({ context }) => !context.session.isSigning,
    canConfirmSkip: ({ context }) =>
      context.session.hasSignInError && !context.session.isSigning,
    canConnect: ({ context }) =>
      context.connection.status === 'idle' ||
      context.connection.status === 'failed',
    usesOwnModal: and([
      'canConnect',
      ({ event }) => event.type === 'CONNECT' && event.usesOwnModal,
    ]),
    ownsConnection: ({ context }) => context.connection.status === 'pending',
    completedConnection: ({ context, event }) =>
      context.connection.status === 'pending' &&
      event.type === 'CONNECT_RESULT' &&
      event.outcome.status === 'connected',
    canSignIn: ({ context }) =>
      context.session.isAccountSettled && !context.session.isSigning,
    isReconnection: ({ event }) =>
      event.type === 'CONNECTED' && event.isReconnected,
    isCancelled: ({ event }) =>
      event.type === 'CONNECT_RESULT' &&
      event.usesOwnModal &&
      event.outcome.status === 'cancelled',
  },
}).createMachine({
  id: 'walletConnection',
  initial: 'closed',
  context: ({ input }) => ({
    session: input,
    entry: 'session',
    connection: { status: 'idle' },
  }),
  on: {
    SESSION_UPDATED: {
      actions: assign({ session: ({ event }) => event.session }),
    },
    CONNECTED: { actions: 'markConnected' },
    DISCONNECTED: {
      target: '.closed',
      actions: [
        'detachConnection',
        assign({
          session: ({ context }) => ({
            ...context.session,
            isConnected: false,
          }),
        }),
      ],
    },
    CONNECT_RESULT: { actions: 'recordConnection' },
  },
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
          actions: [assign({ entry: 'connect' }), 'clearConnectionError'],
        },
      },
    },
    choosing: {
      tags: ['open'],
      on: {
        CONNECT_RESULT: [
          {
            guard: 'completedConnection',
            target: 'signIn',
            actions: ['markConnected', 'recordConnection'],
          },
          { actions: 'recordConnection' },
        ],
        // Closing the picker preserves a pending connect; only disconnect detaches it.
        DISMISS: 'closed',
        CONNECT: [
          {
            guard: 'usesOwnModal',
            target: 'pairing',
            actions: 'startConnection',
          },
          { guard: 'canConnect', actions: 'startConnection' },
        ],
        CONNECTED: [
          {
            guard: 'isReconnection',
            target: 'closed',
            actions: 'markConnected',
          },
          {
            guard: 'ownsConnection',
            target: 'signIn',
            actions: 'markConnected',
          },
          { actions: 'markConnected' },
        ],
      },
    },
    pairing: {
      on: {
        OPEN: 'choosing',
        CONNECTED: [
          {
            guard: 'isReconnection',
            target: 'closed',
            actions: 'markConnected',
          },
          {
            guard: 'ownsConnection',
            target: 'signIn',
            actions: 'markConnected',
          },
          { actions: 'markConnected' },
        ],
        CONNECT_RESULT: [
          {
            guard: 'completedConnection',
            target: 'signIn',
            actions: ['markConnected', 'recordConnection'],
          },
          {
            guard: 'isCancelled',
            target: 'closed',
            actions: 'recordConnection',
          },
          { target: 'choosing', actions: 'recordConnection' },
        ],
      },
    },
    signIn: {
      tags: ['open', 'auth'],
      always: { guard: 'authFinished', target: 'closed' },
      on: {
        SIGN_IN: { guard: 'canSignIn', target: 'signIn' },
        CONFIRM_SKIP: { guard: 'canConfirmSkip', target: 'confirmSkip' },
        SKIP: {
          guard: 'canSkip',
          target: 'closed',
          actions: ['dismissAuth', 'skip'],
        },
      },
    },
    confirmSkip: {
      tags: ['open', 'auth'],
      always: { guard: 'authFinished', target: 'closed' },
      on: {
        SIGN_IN: { guard: 'canSignIn', target: 'signIn' },
        SKIP: {
          guard: 'canSkip',
          target: 'closed',
          actions: ['dismissAuth', 'skip'],
        },
      },
    },
  },
})
