import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address, PublicClient } from 'viem'
import { assign, setup } from 'xstate'
import { pollTransactionStatus } from '../../helpers/pollTransactionStatus.actor'
import * as auditTrail from '../../services/audit-trail.service'
import type { Signer } from '../../types/signer.types'
import { submitProfileRecordsUpdateActor } from './records.actors'
import type { ServiceRecordSnapshot } from './records.types'

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
  txHash?: string
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

const startUpdateAssignment = {
  name: ({ event }: any) => event.name,
  before: ({ event }: any) => event.before,
  after: ({ event }: any) => event.after,
  signer: ({ event }: any) => event.signer,
  accountAddress: ({ event }: any) => event.accountAddress,
  publicClient: ({ event }: any) => event.publicClient,
  resolverAddress: ({ event, context }: any) =>
    event.resolverAddress ?? context.resolverAddress,
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
        accountAddress: Address
        resolverAddress?: Address
      }) => submitProfileRecordsUpdateActor(input),
    ),
    pollTransactionStatus: fromResultAsync((input: { txId: string }) =>
      pollTransactionStatus(input.txId),
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
          accountAddress: context.accountAddress!,
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
