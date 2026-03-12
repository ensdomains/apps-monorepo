import {
  type RegistrationEvent,
  registrationMachine,
} from '@ens-apps/transaction-manager'
import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { secondsInYear } from 'date-fns/constants'
import { sepolia } from 'viem/chains'
import {
  type ActorRefFrom,
  assign,
  type SnapshotFrom,
  sendTo,
  setup,
} from 'xstate'

export const REGISTRATION_V2_ACTOR_ID = 'registrationActor'

export const registrationV2UiMachine = setup({
  types: {
    context: {} as {
      chainId: number
      /**
       * Duration in seconds
       */
      duration: number
      selectedToken: SUPPORTED_TOKEN
      lastErrorMessage?: string
    },
    events: {} as
      | { type: 'DURATION_SET'; duration: number }
      | { type: 'TOKEN_SET'; token: SUPPORTED_TOKEN }
      | {
          type: 'SUBMIT_REGISTRATION'
          startEvent: Extract<RegistrationEvent, { type: 'START_REGISTRATION' }>
        }
      | { type: 'TX_SUCCEEDED' }
      | { type: 'TX_FAILED'; message?: string }
      | { type: 'RETRY' }
      | { type: 'CANCEL' },
  },
  actors: {
    registrationFlow: registrationMachine,
  },
  actions: {
    setDuration: assign({
      duration: ({ event }) =>
        event.type === 'DURATION_SET' ? event.duration : secondsInYear,
    }),
    setToken: assign({
      selectedToken: ({ event, context }) =>
        event.type === 'TOKEN_SET' ? event.token : context.selectedToken,
    }),
    clearError: assign({
      lastErrorMessage: () => undefined,
    }),
    setError: assign({
      lastErrorMessage: ({ event }) =>
        event.type === 'TX_FAILED' ? event.message : undefined,
    }),
    forwardStartRegistration: sendTo(REGISTRATION_V2_ACTOR_ID, ({ event }) => {
      if (event.type !== 'SUBMIT_REGISTRATION') {
        throw new Error('SUBMIT_REGISTRATION event required')
      }

      return event.startEvent
    }),
    forwardRetry: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'RETRY' }),
    forwardCancel: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'CANCEL' }),
  },
}).createMachine({
  id: 'registrationV2Ui',
  invoke: {
    id: REGISTRATION_V2_ACTOR_ID,
    src: 'registrationFlow',
    input: ({ context }) => ({
      chainId: context.chainId,
    }),
  },
  initial: 'editing',
  context: () => ({
    chainId: sepolia.id,
    duration: secondsInYear,
    selectedToken: 'USDC',
    lastErrorMessage: undefined,
  }),
  states: {
    editing: {
      on: {
        DURATION_SET: {
          actions: 'setDuration',
        },
        TOKEN_SET: {
          actions: 'setToken',
        },
        SUBMIT_REGISTRATION: {
          target: 'registering',
          actions: ['clearError', 'forwardStartRegistration'],
        },
      },
    },
    registering: {
      on: {
        TX_SUCCEEDED: {
          target: 'success',
        },
        TX_FAILED: {
          target: 'failure',
          actions: 'setError',
        },
        CANCEL: {
          target: 'editing',
          actions: 'forwardCancel',
        },
      },
    },
    success: {},
    failure: {
      on: {
        RETRY: {
          target: 'registering',
          actions: ['clearError', 'forwardRetry'],
        },
        CANCEL: {
          target: 'editing',
          actions: ['clearError', 'forwardCancel'],
        },
      },
    },
  },
})

export type RegistrationV2UiActor = ActorRefFrom<typeof registrationV2UiMachine>

export const getRegistrationV2ChildActor = (
  snapshot: SnapshotFrom<typeof registrationV2UiMachine>,
) =>
  snapshot.children[REGISTRATION_V2_ACTOR_ID] as
    | ActorRefFrom<typeof registrationMachine>
    | undefined
