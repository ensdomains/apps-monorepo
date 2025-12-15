import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address, PublicClient } from 'viem'
import { assign, setup } from 'xstate'
import { pollTransactionStatus } from '../../helpers/pollTransactionStatus.actor'
import * as auditTrail from '../../services/audit-trail.service'
import type { Signer } from '../../types/signer.types'
import { submitPrimaryNameUpdateActor } from './primaryName.actors'

export type PrimaryNameContext = {
  signer?: Signer
  accountAddress?: Address
  publicClient?: PublicClient
  chainId: number
  name: string
  updateTxId?: string
  txHash?: string
  error?: Error
}

export type PrimaryNameEvent =
  | {
      type: 'START_UPDATE'
      name: string
      signer: Signer
      accountAddress: Address
      publicClient: PublicClient
    }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }

export type PrimaryNameInput = {
  chainId: number
}

const startUpdateAssignment = {
  name: ({ event }: any) => event.name,
  signer: ({ event }: any) => event.signer,
  accountAddress: ({ event }: any) => event.accountAddress,
  publicClient: ({ event }: any) => event.publicClient,
}

export const primaryNameMachine = setup({
  types: {
    context: {} as PrimaryNameContext,
    events: {} as PrimaryNameEvent,
    input: {} as PrimaryNameInput,
  },

  actors: {
    submitPrimaryNameUpdate: fromResultAsync(
      (input: {
        name: string
        signer: Signer
        accountAddress: Address
        publicClient: PublicClient
        chainId: number
      }) => submitPrimaryNameUpdateActor(input),
    ),
    pollTransactionStatus: fromResultAsync((input: { txId: string }) =>
      pollTransactionStatus(input.txId),
    ),
  },

  actions: {
    logTransition: ({ context, event }) => {
      console.log('🔧 [PRIMARY NAME] State transition:', {
        event: event?.type,
        name: context.name,
        updateTxId: context.updateTxId,
      })
    },

    recordTransition: ({ context, self, event }) => {
      try {
        const state = self.getSnapshot()
        auditTrail.recordTransition({
          machineId: 'primary-name',
          fromState:
            state.status === 'active' ? String(state.value) : 'unknown',
          toState: String(state.value),
          event: event?.type || 'unknown',
          context: {
            name: context.name,
            updateTxId: context.updateTxId,
          },
          metadata: {
            chainId: context.chainId,
          },
        })
      } catch (auditError) {
        console.warn('Audit service error (non-fatal):', auditError)
      }
    },

    clearSnapshot: async () => {
      console.log('🗑️ [PRIMARY NAME] Cleared snapshot')
    },
  },
}).createMachine({
  id: 'primary-name',
  initial: 'idle',

  context: ({ input }) => ({
    signer: undefined,
    accountAddress: undefined,
    publicClient: undefined,
    chainId: input.chainId,
    name: '',
    updateTxId: undefined,
    txHash: undefined,
    error: undefined,
  }),

  states: {
    idle: {
      on: {
        START_UPDATE: {
          target: 'settingUpUpdate',
          actions: assign(startUpdateAssignment),
        },
      },
    },

    settingUpUpdate: {
      entry: ({ context }) => {
        console.log('📝 [PRIMARY NAME] Setup complete, context populated:', {
          hasPublicClient: !!context.publicClient,
          hasAccountAddress: !!context.accountAddress,
          hasSigner: !!context.signer,
          name: context.name,
        })
      },
      always: {
        target: 'submittingUpdate',
      },
    },

    submittingUpdate: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'submitPrimaryNameUpdate',
        input: ({ context }) => ({
          name: context.name,
          signer: context.signer!,
          accountAddress: context.accountAddress!,
          publicClient: context.publicClient!,
          chainId: context.chainId,
        }),
        onDone: {
          target: 'waitingForUpdate',
          actions: assign({
            updateTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error as Error,
          }),
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForUpdate: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        input: ({ context }) => ({ txId: context.updateTxId! }),
        onDone: {
          target: 'success',
          actions: assign({
            txHash: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error as Error,
          }),
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    success: {
      entry: ['logTransition', 'recordTransition', 'clearSnapshot'],
      on: {
        START_UPDATE: {
          target: 'settingUpUpdate',
          actions: assign({
            ...startUpdateAssignment,
            error: () => undefined,
            updateTxId: () => undefined,
          }),
        },
        CANCEL: 'idle',
      },
    },

    error: {
      entry: ['logTransition', 'recordTransition'],
      on: {
        START_UPDATE: {
          target: 'settingUpUpdate',
          actions: assign({
            ...startUpdateAssignment,
            error: () => undefined,
            updateTxId: () => undefined,
          }),
        },
        RETRY: {
          target: 'submittingUpdate',
          actions: assign({
            error: () => undefined,
          }),
        },
        CANCEL: 'idle',
      },
    },
  },
})
