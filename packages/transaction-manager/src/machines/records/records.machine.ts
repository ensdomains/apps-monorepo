import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address, PublicClient } from 'viem'
import { assign, setup } from 'xstate'
import * as auditTrail from '../../services/audit-trail.service'
import type { Signer } from '../../types/signer.types'
import {
  pollTransactionStatusActor,
  type ServiceRecordSnapshot,
  submitProfileRecordsUpdateActor,
} from './records.actors'

export type RecordsContext = {
  signer?: Signer
  accountAddress?: Address
  publicClient?: PublicClient
  chainId: number

  name: string
  resolverAddress?: Address
  before?: ServiceRecordSnapshot
  after?: ServiceRecordSnapshot

  updateTxId?: string
  error?: Error
}

export type RecordsEvent =
  | {
      type: 'START_UPDATE'
      name: string
      before: ServiceRecordSnapshot
      after: ServiceRecordSnapshot
      signer: Signer
      accountAddress: Address
      publicClient: PublicClient
      resolverAddress?: Address
    }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }

export type RecordsInput = {
  chainId: number
}

export const recordsMachine = setup({
  types: {
    context: {} as RecordsContext,
    events: {} as RecordsEvent,
    input: {} as RecordsInput,
  },

  actors: {
    submitRecordsUpdate: fromResultAsync(
      (input: {
        name: string
        before: ServiceRecordSnapshot
        after: ServiceRecordSnapshot
        signer: Signer
        publicClient: PublicClient
        chainId: number
        resolverAddress?: Address
      }) => submitProfileRecordsUpdateActor(input),
    ),
    pollTransactionStatus: fromResultAsync((input: { txId: string }) =>
      pollTransactionStatusActor(input),
    ),
  },

  actions: {
    logTransition: ({ context, event }) => {
      console.log('🔧 [RECORDS] State transition:', {
        event: event?.type,
        name: context.name,
        updateTxId: context.updateTxId,
      })
    },

    recordTransition: ({ context, self, event }) => {
      try {
        const state = self.getSnapshot()
        auditTrail.recordTransition({
          machineId: 'records',
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
      console.log('🗑️ [RECORDS] Cleared snapshot')
    },
  },
}).createMachine({
  id: 'records',
  initial: 'idle',

  context: ({ input }) => ({
    signer: undefined,
    accountAddress: undefined,
    publicClient: undefined,
    chainId: input.chainId,
    name: '',
    resolverAddress: undefined,
    before: undefined,
    after: undefined,
    updateTxId: undefined,
    error: undefined,
  }),

  states: {
    idle: {
      on: {
        START_UPDATE: {
          target: 'settingUpUpdate',
          actions: assign({
            name: ({ event }) => event.name,
            before: ({ event }) => event.before,
            after: ({ event }) => event.after,
            signer: ({ event }) => event.signer,
            accountAddress: ({ event }) => event.accountAddress,
            publicClient: ({ event }) => event.publicClient,
            resolverAddress: ({ event, context }) =>
              event.resolverAddress ?? context.resolverAddress,
          }),
        },
      },
    },

    settingUpUpdate: {
      entry: ({ context }) => {
        console.log('📝 [RECORDS] Setup complete, context populated:', {
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
        src: 'submitRecordsUpdate',
        input: ({ context }) => ({
          name: context.name,
          before: context.before!,
          after: context.after!,
          signer: context.signer!,
          publicClient: context.publicClient!,
          chainId: context.chainId,
          resolverAddress: context.resolverAddress,
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
        onDone: 'success',
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
    },

    error: {
      entry: ['logTransition', 'recordTransition'],
      on: {
        START_UPDATE: {
          target: 'settingUpUpdate',
          actions: assign({
            name: ({ event }) => event.name,
            before: ({ event }) => event.before,
            after: ({ event }) => event.after,
            signer: ({ event }) => event.signer,
            accountAddress: ({ event }) => event.accountAddress,
            publicClient: ({ event }) => event.publicClient,
            resolverAddress: ({ event, context }) =>
              event.resolverAddress ?? context.resolverAddress,
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
