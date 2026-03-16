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
  raise,
  type SnapshotFrom,
  sendTo,
  setup,
} from 'xstate'

export const REGISTRATION_V2_ACTOR_ID = 'registrationActor'

type Context = {
  chainId: number
  /**
   * Duration in seconds
   */
  duration: number
  selectedToken: SUPPORTED_TOKEN | undefined
  lastErrorMessage?: string
}

type Events =
  | { type: 'pricing.step.next' }
  | { type: 'pricing.step.previous' }
  | { type: 'pricing.dialog.dismiss' }
  | { type: 'pricing.duration.set'; duration: number }
  | { type: 'pricing.token.select'; token: SUPPORTED_TOKEN | undefined }
  | {
      type: 'registration.submit'
      startEvent: Extract<RegistrationEvent, { type: 'START_REGISTRATION' }>
    }
  | { type: 'TX_SUCCEEDED' }
  | { type: 'TX_FAILED'; message?: string }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }

const machineSetup = setup({
  types: {
    context: {} as Context,
    events: {} as Events,
  },
  actors: {
    registrationFlow: registrationMachine,
  },
  actions: {
    setDuration: assign({
      duration: ({ event }) =>
        event.type === 'pricing.duration.set' ? event.duration : secondsInYear,
    }),
    setToken: assign({
      selectedToken: ({ event, context }) =>
        event.type === 'pricing.token.select'
          ? event.token
          : context.selectedToken,
    }),
    clearError: assign({
      lastErrorMessage: () => undefined,
    }),
    setError: assign({
      lastErrorMessage: ({ event }) =>
        event.type === 'TX_FAILED' ? event.message : undefined,
    }),
    forwardStartRegistration: sendTo(REGISTRATION_V2_ACTOR_ID, ({ event }) => {
      if (event.type !== 'registration.submit') {
        throw new Error('registration.submit event required')
      }

      return event.startEvent
    }),
    forwardRetry: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'RETRY' }),
    forwardCancel: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'CANCEL' }),
  },
})

export const registrationV2UiMachine = machineSetup.createMachine({
  id: 'registrationV2Ui',
  invoke: {
    id: REGISTRATION_V2_ACTOR_ID,
    src: 'registrationFlow',
    input: ({ context }) => ({
      chainId: context.chainId,
    }),
    onDone: {
      actions: [
        raise({
          type: 'TX_SUCCEEDED',
        }),
      ],
    },
    onSnapshot: {
      guard: ({ event: { snapshot } }) => snapshot.matches('error'),
      actions: [
        raise(({ event: { snapshot } }) => ({
          type: 'TX_FAILED',
          message: snapshot.context.error?.message,
        })),
      ],
    },
  },
  initial: 'pricing',
  context: () => ({
    chainId: sepolia.id,
    duration: secondsInYear,
    selectedToken: undefined,
    lastErrorMessage: undefined,
  }),
  states: {
    pricing: {
      initial: 'duration',
      states: {
        duration: {
          on: {
            'pricing.duration.set': {
              actions: 'setDuration',
            },
            'pricing.step.next': {
              target: 'tokens',
            },
          },
        },
        tokens: {
          on: {
            'pricing.step.previous': {
              target: 'duration',
            },
            'pricing.token.select': {
              actions: 'setToken',
            },
            'pricing.step.next': {
              target: 'confirm',
            },
            'pricing.dialog.dismiss': {
              target: 'duration',
            },
          },
        },
        confirm: {
          on: {
            'pricing.step.previous': {
              target: 'tokens',
            },
            'pricing.dialog.dismiss': {
              target: 'duration',
            },
            'registration.submit': {
              target: '#registrationV2Ui.registering',
              actions: ['clearError', 'forwardStartRegistration'],
            },
          },
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
          target: 'pricing',
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
          target: 'pricing',
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
