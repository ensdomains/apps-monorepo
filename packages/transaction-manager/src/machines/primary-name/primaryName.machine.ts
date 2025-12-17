import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { assign, setup } from 'xstate'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { pollTransactionStatus } from '../../helpers/pollTransactionStatus.actor'
import * as auditTrail from '../../services/audit-trail.service'
import type { Signer } from '../../types/signer.types'
import {
  requestEOASignatureActor,
  submitPrimaryNameUpdateActor,
  submitPrimaryNameWithSignatureActor,
} from './primaryName.actors'

// ETH coin type for signature
const ETH_COIN_TYPE = 60n

export type PrimaryNameContext = {
  signer?: Signer
  accountAddress?: Address
  publicClient?: PublicClient
  chainId: number
  name: string
  updateTxId?: string
  txHash?: string
  error?: Error
  // Signature flow fields
  walletClient?: WalletClient
  eoaAddress?: Address
  signature?: Hex
  signatureExpiry?: bigint
}

export type PrimaryNameEvent =
  | {
      type: 'START_UPDATE'
      name: string
      signer: Signer
      accountAddress: Address
      publicClient: PublicClient
      // Optional: for signature flow when using smart account
      walletClient?: WalletClient
      eoaAddress?: Address
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
  walletClient: ({ event }: any) => event.walletClient,
  eoaAddress: ({ event }: any) => event.eoaAddress,
}

/**
 * Check if we need the signature flow
 * Signature flow is needed when:
 * 1. Using a smart account signer (not EOA)
 * 2. walletClient and eoaAddress are provided
 */
function needsSignatureFlow(context: PrimaryNameContext): boolean {
  return (
    context.signer?.type !== 'eoa' &&
    !!context.walletClient &&
    !!context.eoaAddress
  )
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
    requestEOASignature: fromResultAsync(
      (input: {
        name: string
        eoaAddress: Address
        signatureExpiry: bigint
        coinTypes: bigint[]
        walletClient: WalletClient
        registrarAddress: Address
      }) => requestEOASignatureActor(input),
    ),
    submitWithSignature: fromResultAsync(
      (input: {
        name: string
        eoaAddress: Address
        signature: Hex
        signatureExpiry: bigint
        coinTypes: bigint[]
        signer: Signer
        publicClient: PublicClient
        chainId: number
      }) => submitPrimaryNameWithSignatureActor(input),
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
    // Signature flow fields
    walletClient: undefined,
    eoaAddress: undefined,
    signature: undefined,
    signatureExpiry: undefined,
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
          signerType: context.signer?.type,
          name: context.name,
          hasWalletClient: !!context.walletClient,
          eoaAddress: context.eoaAddress,
          needsSignature: needsSignatureFlow(context),
        })
      },
      always: [
        // Route to signature flow if using smart account with EOA details
        {
          target: 'requestingSignature',
          guard: ({ context }) => needsSignatureFlow(context),
        },
        // Otherwise use direct update (EOA signer)
        {
          target: 'submittingUpdate',
        },
      ],
    },

    requestingSignature: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'requestEOASignature',
        input: ({ context }) => {
          // Calculate signature expiry: 30 minutes from now (within 1 hour limit)
          const signatureExpiry = BigInt(
            Math.floor(Date.now() / 1000) + 30 * 60,
          )
          return {
            name: context.name,
            eoaAddress: context.eoaAddress!,
            signatureExpiry,
            coinTypes: [ETH_COIN_TYPE],
            walletClient: context.walletClient!,
            registrarAddress: ENS_SEPOLIA_CONTRACTS.DefaultReverseRegistrar,
          }
        },
        onDone: {
          target: 'submittingWithSignature',
          actions: assign({
            // Extract both signature and expiry from the result
            // They must stay coupled since the expiry is embedded in the signed message
            signature: ({ event }) => event.output.signature,
            signatureExpiry: ({ event }) => event.output.signatureExpiry,
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

    submittingWithSignature: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'submitWithSignature',
        input: ({ context }) => ({
          name: context.name,
          eoaAddress: context.eoaAddress!,
          signature: context.signature!,
          signatureExpiry: context.signatureExpiry!,
          coinTypes: [ETH_COIN_TYPE],
          signer: context.signer!,
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
