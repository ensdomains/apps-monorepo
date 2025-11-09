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
  // Account & client
  signer?: Signer
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
      signer: Signer
      accountAddress: Address
      publicClient: PublicClient
    }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }

export type RegistrationInput = {
  chainId: number
}

export const registrationMachine = setup({
  types: {
    context: {} as RegistrationContext,
    events: {} as RegistrationEvent,
    input: {} as RegistrationInput,
  },

  actors: {
    generateCommitment: fromResultAsync(
      ({
        name,
        owner,
        duration,
        publicClient,
        selectedToken,
      }: {
        name: string
        owner: Address
        duration: bigint
        publicClient: PublicClient
        selectedToken: 'USDC' | 'DAI'
      }) => {
        const { generateCommitmentActor } = require('./registration.actors')
        return generateCommitmentActor({
          name,
          owner,
          duration,
          publicClient,
          selectedToken,
        })
      },
    ),
    submitCommitment: fromResultAsync(
      (input: {
        commitment: CommitmentData
        signer: Signer
        name: string
        duration: bigint
        publicClient: PublicClient
      }) => {
        const { submitCommitmentActor } = require('./registration.actors')
        return submitCommitmentActor(input)
      },
    ),
    submitApproval: fromResultAsync(
      (input: {
        tokenPrice: bigint
        selectedToken: 'USDC' | 'DAI'
        signer: Signer
        publicClient: PublicClient
      }) => {
        const { submitApprovalActor } = require('./registration.actors')
        return submitApprovalActor(input)
      },
    ),
    submitRegistration: fromResultAsync(
      (input: {
        name: string
        commitment: CommitmentData
        signer: Signer
        duration: bigint
        selectedToken: 'USDC' | 'DAI'
        owner: Address
        publicClient: PublicClient
      }) => {
        const { submitRegistrationActor } = require('./registration.actors')
        return submitRegistrationActor(input)
      },
    ),
    pollTransactionStatus: fromResultAsync((input: { txId: string }) => {
      const { pollTransactionStatusActor } = require('./registration.actors')
      return pollTransactionStatusActor(input)
    }),
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
    signer: undefined,
    accountAddress: undefined,
    publicClient: undefined,
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
          target: 'settingUpRegistration',
          actions: assign({
            name: ({ event }) => event.name,
            duration: ({ event }) => event.duration,
            selectedToken: ({ event }) => event.token,
            tokenPrice: ({ event }) => event.price,
            signer: ({ event }) => event.signer,
            accountAddress: ({ event }) => event.accountAddress,
            publicClient: ({ event }) => event.publicClient,
          }),
        },
      },
    },

    settingUpRegistration: {
      entry: ({ context }) => {
        console.log('📝 [REGISTRATION] Setup complete, context populated:', {
          hasPublicClient: !!context.publicClient,
          hasAccountAddress: !!context.accountAddress,
          hasSigner: !!context.signer,
          name: context.name,
        })
      },
      always: {
        target: 'preparingCommitment',
      },
    },

    preparingCommitment: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'generateCommitment',
        input: ({ context }) => {
          console.log('🔍 [REGISTRATION] preparingCommitment invoke input:', {
            hasPublicClient: !!context.publicClient,
            hasAccountAddress: !!context.accountAddress,
            name: context.name,
          })

          return {
            name: context.name,
            owner: context.accountAddress!,
            duration: context.duration,
            publicClient: context.publicClient!,
            selectedToken: context.selectedToken,
          }
        },
        onDone: {
          target: 'committingTransaction',
          actions: assign({
            commitment: ({ event }) => event.output,
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

    committingTransaction: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'submitCommitment',
        input: ({ context }) => ({
          commitment: context.commitment!,
          signer: context.signer!,
          name: context.name,
          duration: context.duration,
          publicClient: context.publicClient!,
        }),
        onDone: {
          target: 'waitingForCommitment',
          actions: assign({
            commitmentTxId: ({ event }) => event.output,
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

    waitingForCommitment: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        input: ({ context }) => ({ txId: context.commitmentTxId! }),
        onDone: 'approvingToken',
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

    approvingToken: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'submitApproval',
        input: ({ context }) => ({
          tokenPrice: context.tokenPrice,
          selectedToken: context.selectedToken,
          signer: context.signer!,
          publicClient: context.publicClient!,
        }),
        onDone: {
          target: 'waitingForApproval',
          actions: assign({
            approvalTxId: ({ event }) => event.output,
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

    waitingForApproval: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        input: ({ context }) => ({ txId: context.approvalTxId! }),
        onDone: 'registeringDomain',
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

    registeringDomain: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'submitRegistration',
        input: ({ context }) => ({
          name: context.name,
          commitment: context.commitment!,
          signer: context.signer!,
          duration: context.duration,
          selectedToken: context.selectedToken,
          owner: context.accountAddress!,
          publicClient: context.publicClient!,
        }),
        onDone: {
          target: 'waitingForRegistration',
          actions: assign({
            registrationTxId: ({ event }) => event.output,
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

    waitingForRegistration: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        input: ({ context }) => ({ txId: context.registrationTxId! }),
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
