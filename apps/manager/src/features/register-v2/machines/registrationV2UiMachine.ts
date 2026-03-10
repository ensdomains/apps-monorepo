import { registrationMachine } from '@ens-apps/transaction-manager'
import type { Address, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import {
  type ActorRefFrom,
  assign,
  type SnapshotFrom,
  sendTo,
  setup,
} from 'xstate'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import type { SmartAccountState } from '@/lib/smart-account'

type RegistrationSigner = NonNullable<SmartAccountState['signer']>

type StartRegistrationEvent = {
  type: 'START_REGISTRATION'
  name: string
  duration: bigint
  token: 'USDC' | 'DAI'
  price: bigint
  signer: RegistrationSigner
  accountAddress: Address
  ownerAddress?: Address
  publicClient: PublicClient
  useFastRegistrar?: boolean
  sponsored?: boolean
}

export const REGISTRATION_V2_ACTOR_ID = 'registrationActor'

export const registrationV2UiMachine = setup({
  types: {
    context: {} as {
      chainId: number
      durationYears: number
      selectedToken: Address
      lastErrorMessage?: string
    },
    events: {} as
      | { type: 'DURATION_SET'; durationYears: number }
      | { type: 'TOKEN_SET'; token: Address }
      | { type: 'SUBMIT_REGISTRATION'; startEvent: StartRegistrationEvent }
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
      durationYears: ({ event }) =>
        event.type === 'DURATION_SET' ? event.durationYears : 1,
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
    durationYears: 1,
    selectedToken: SUPPORTED_TOKENS.USDC,
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
