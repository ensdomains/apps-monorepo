import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Address, Hash, PublicClient } from 'viem'
import { type ActorLogic, assign, setup } from 'xstate'
import * as auditTrail from '../../services/audit-trail.service'
import type { Signer } from '../../types/signer.types'

/**
 * Registration Machine
 *
 * Orchestrates the ENS registration flow:
 * 1. Generate commitment
 * 2. Submit commitment transaction
 * 3. Wait for commitment confirmation
 * 4. Approve token spend
 * 5. Wait for approval confirmation
 * 6. Submit registration transaction
 * 7. Wait for registration confirmation
 *
 * Persistence is handled automatically via inspect option (see export at bottom)
 */

type CommitmentData = {
  commitment: Hash
  secret: string
}

export type RegistrationContext = {
  // Input params
  rhinestoneAccount?: RhinestoneAccount
  accountAddress?: Address
  publicClient?: PublicClient
  chainId: number

  // Registration params
  name: string
  duration: bigint
  selectedToken: 'USDC' | 'DAI'
  tokenPrice: bigint

  // Flow state
  commitment?: CommitmentData
  commitmentTxId?: string
  approvalTxId?: string
  registrationTxId?: string

  // Error state
  error?: Error
}

export type RegistrationEvent =
  | {
      type: 'START_REGISTRATION'
      name: string
      duration: bigint
      token: 'USDC' | 'DAI'
      price: bigint
    }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }

export type RegistrationInput = {
  rhinestoneAccount: RhinestoneAccount
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
}

export const registrationMachine: ActorLogic<any, any, any, any, any> = setup({
  types: {
    context: {} as RegistrationContext,
    events: {} as RegistrationEvent,
    input: {} as RegistrationInput,
  },

  actors: {
    // TODO: Implement these actors in registration.actors.ts
    // generateCommitment: fromResultAsync(generateCommitmentActor),
    // submitCommitment: fromResultAsync(submitCommitmentActor),
    // submitApproval: fromResultAsync(submitApprovalActor),
    // submitRegistration: fromResultAsync(submitRegistrationActor),
    // pollTransactionStatus: fromResultAsync(pollTransactionStatusActor),
  },

  actions: {
    logTransition: ({ context, event }) => {
      console.log('🔧 [REGISTRATION] State transition:', {
        event: event?.type,
        name: context.name,
        hasCommitment: !!context.commitment,
        commitmentTxId: context.commitmentTxId,
        approvalTxId: context.approvalTxId,
        registrationTxId: context.registrationTxId,
      })
    },

    recordTransition: ({ context, self, event }) => {
      try {
        const state = self.getSnapshot()
        auditTrail.recordTransition({
          machineId: 'registration',
          fromState:
            state.status === 'active' ? String(state.value) : 'unknown',
          toState: String(state.value),
          event: event?.type || 'unknown',
          context: {
            name: context.name,
            duration: context.duration.toString(),
            commitmentTxId: context.commitmentTxId,
            approvalTxId: context.approvalTxId,
            registrationTxId: context.registrationTxId,
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
      // TODO: Implement via persistence service
      // await persistenceService.clearRegistrationSnapshot()
      console.log('🗑️ [REGISTRATION] Cleared snapshot')
    },
  },

  // Note: Persistence will be handled via inspect option (see export at bottom)
}).createMachine({
  id: 'registration',
  initial: 'idle',

  context: ({ input }) => ({
    rhinestoneAccount: input.rhinestoneAccount,
    accountAddress: input.accountAddress,
    publicClient: input.publicClient,
    chainId: input.chainId,
    name: '',
    duration: 0n,
    selectedToken: 'USDC',
    tokenPrice: 0n,
  }),

  states: {
    idle: {
      on: {
        START_REGISTRATION: {
          target: 'preparingCommitment',
          actions: assign({
            name: ({ event }) => event.name,
            duration: ({ event }) => event.duration,
            selectedToken: ({ event }) => event.token,
            tokenPrice: ({ event }) => event.price,
          }),
        },
      },
    },

    preparingCommitment: {
      entry: ['logTransition', 'recordTransition'],
      // TODO: Invoke generateCommitment actor
      // invoke: {
      //   src: 'generateCommitment',
      //   input: ({ context }) => ({
      //     name: context.name,
      //     owner: context.accountAddress!,
      //   }),
      //   onDone: {
      //     target: 'committingTransaction',
      //     actions: assign({
      //       commitment: ({ event }) => event.output,
      //     }),
      //   },
      //   onError: {
      //     target: 'error',
      //     actions: assign({
      //       error: ({ event }) => event.error as Error,
      //     }),
      //   },
      // },
      on: {
        CANCEL: 'idle',
      },
    },

    committingTransaction: {
      entry: ['logTransition', 'recordTransition'],
      // TODO: Invoke submitCommitment actor
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForCommitment: {
      entry: ['logTransition', 'recordTransition'],
      // TODO: Invoke pollTransactionStatus actor
      on: {
        CANCEL: 'idle',
      },
    },

    approvingToken: {
      entry: ['logTransition', 'recordTransition'],
      // TODO: Invoke submitApproval actor
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForApproval: {
      entry: ['logTransition', 'recordTransition'],
      // TODO: Invoke pollTransactionStatus actor
      on: {
        CANCEL: 'idle',
      },
    },

    registeringDomain: {
      entry: ['logTransition', 'recordTransition'],
      // TODO: Invoke submitRegistration actor
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForRegistration: {
      entry: ['logTransition', 'recordTransition'],
      // TODO: Invoke pollTransactionStatus actor
      on: {
        CANCEL: 'idle',
      },
    },

    success: {
      type: 'final',
      entry: ['logTransition', 'recordTransition', 'clearSnapshot'],
    },

    error: {
      entry: ['logTransition', 'recordTransition'],
      on: {
        RETRY: {
          target: 'preparingCommitment',
          actions: assign({
            error: undefined,
          }),
        },
        CANCEL: 'idle',
      },
    },
  },
})

// TODO: Add persistence wrapper with inspect option
// const savedSnapshot = await persistenceService.loadRegistrationSnapshot()
// export const registrationMachine = savedSnapshot
//   ? baseMachine.provide({ snapshot: savedSnapshot })
//   : baseMachine
