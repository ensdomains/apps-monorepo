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
  submitReverseUpdateActor,
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
  reverseTxId?: string
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

type StartUpdateEvent = Extract<PrimaryNameEvent, { type: 'START_UPDATE' }>

const startUpdateAssignment = {
  name: ({ event }: { event: StartUpdateEvent }) => event.name,
  signer: ({ event }: { event: StartUpdateEvent }) => event.signer,
  accountAddress: ({ event }: { event: StartUpdateEvent }) =>
    event.accountAddress,
  publicClient: ({ event }: { event: StartUpdateEvent }) => event.publicClient,
  walletClient: ({ event }: { event: StartUpdateEvent }) => event.walletClient,
  eoaAddress: ({ event }: { event: StartUpdateEvent }) => event.eoaAddress,
}

/**
 * Check if we need the signature flow
 * Signature flow is needed when:
 * 1. Using a smart account signer (not EOA)
 * 2. walletClient and eoaAddress are provided
 */
const needsSignatureFlow = (context: PrimaryNameContext): boolean =>
  context.signer?.type !== 'eoa' &&
  !!context.walletClient &&
  !!context.eoaAddress

function assertCoreReady(
  context: PrimaryNameContext,
): asserts context is PrimaryNameContext & {
  signer: Signer
  accountAddress: Address
  publicClient: PublicClient
} {
  if (!context.signer || !context.accountAddress || !context.publicClient) {
    throw new Error('primary-name context not ready')
  }
}

function assertSignatureRequestReady(
  context: PrimaryNameContext,
): asserts context is PrimaryNameContext & {
  eoaAddress: Address
  walletClient: WalletClient
} {
  if (!context.eoaAddress || !context.walletClient) {
    throw new Error('primary-name signature request context not ready')
  }
}

function assertSignatureSubmitReady(
  context: PrimaryNameContext,
): asserts context is PrimaryNameContext & {
  eoaAddress: Address
  signature: Hex
  signatureExpiry: bigint
  signer: Signer
  publicClient: PublicClient
} {
  if (
    !context.eoaAddress ||
    !context.signature ||
    !context.signatureExpiry ||
    !context.signer ||
    !context.publicClient
  ) {
    throw new Error('primary-name signature submit context not ready')
  }
}

function assertUpdateTxIdReady(
  context: PrimaryNameContext,
): asserts context is PrimaryNameContext & { updateTxId: string } {
  if (!context.updateTxId) {
    throw new Error('primary-name updateTxId not set')
  }
}

function assertReverseTxIdReady(
  context: PrimaryNameContext,
): asserts context is PrimaryNameContext & { reverseTxId: string } {
  if (!context.reverseTxId) {
    throw new Error('primary-name reverseTxId not set')
  }
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
    submitReverseUpdate: fromResultAsync(
      (input: {
        name: string
        signer: Signer
        accountAddress: Address
        publicClient: PublicClient
        chainId: number
      }) => submitReverseUpdateActor(input),
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
    reverseTxId: undefined,
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
          assertSignatureRequestReady(context)
          // Calculate signature expiry: 30 minutes from now (within 1 hour limit)
          const signatureExpiry = BigInt(
            Math.floor(Date.now() / 1000) + 30 * 60,
          )
          return {
            name: context.name,
            eoaAddress: context.eoaAddress,
            signatureExpiry,
            coinTypes: [ETH_COIN_TYPE],
            walletClient: context.walletClient,
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
        input: ({ context }) => {
          assertSignatureSubmitReady(context)
          return {
            name: context.name,
            eoaAddress: context.eoaAddress,
            signature: context.signature,
            signatureExpiry: context.signatureExpiry,
            coinTypes: [ETH_COIN_TYPE],
            signer: context.signer,
            publicClient: context.publicClient,
            chainId: context.chainId,
          }
        },
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
        input: ({ context }) => {
          assertCoreReady(context)
          return {
            name: context.name,
            signer: context.signer,
            accountAddress: context.accountAddress,
            publicClient: context.publicClient,
            chainId: context.chainId,
          }
        },
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
        input: ({ context }) => {
          assertUpdateTxIdReady(context)
          return { txId: context.updateTxId }
        },
        onDone: [
          {
            target: 'submittingReverse',
            guard: ({ context }) => context.signer?.type === 'eoa',
            actions: assign({
              txHash: ({ event }) => event.output,
            }),
          },
          {
            target: 'success',
            actions: assign({
              txHash: ({ event }) => event.output,
            }),
          },
        ],
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

    submittingReverse: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'submitReverseUpdate',
        input: ({ context }) => {
          assertCoreReady(context)
          return {
            name: context.name,
            signer: context.signer,
            accountAddress: context.accountAddress,
            publicClient: context.publicClient,
            chainId: context.chainId,
          }
        },
        onDone: {
          target: 'waitingForReverse',
          actions: assign({
            reverseTxId: ({ event }) => event.output,
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

    waitingForReverse: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        input: ({ context }) => {
          assertReverseTxIdReady(context)
          return { txId: context.reverseTxId }
        },
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
            reverseTxId: () => undefined,
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
            reverseTxId: () => undefined,
          }),
        },
        // Resume the reverse-leg directly if the primary tx already landed;
        // otherwise re-run from the top.
        RETRY: [
          {
            target: 'submittingReverse',
            guard: ({ context }) =>
              !!context.updateTxId && context.signer?.type === 'eoa',
            actions: assign({
              error: () => undefined,
              reverseTxId: () => undefined,
            }),
          },
          {
            target: 'submittingUpdate',
            actions: assign({
              error: () => undefined,
              updateTxId: () => undefined,
              reverseTxId: () => undefined,
            }),
          },
        ],
        CANCEL: 'idle',
      },
    },
  },
})
