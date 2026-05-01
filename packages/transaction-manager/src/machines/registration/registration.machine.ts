import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address, Hash, Hex, PublicClient } from 'viem'
import { assign, fromPromise, setup } from 'xstate'
import * as auditTrail from '../../services/audit-trail.service'
import type { Signer } from '../../types/signer.types'
import {
  generateCommitmentActor,
  pollTransactionStatusActor,
  readMinCommitmentAgeActor,
  readPaymentTokenAllowanceActor,
  resolveResolverDeploymentActor,
  submitApprovalActor,
  submitApprovalAndRegistrationActor,
  submitCommitmentActor,
  submitRegistrationActor,
  submitResolverDeploymentActor,
  validateCommitmentActor,
} from './registration.actors'

/**
 * Registration Machine
 *
 * Orchestrates the ENS registration flow:
 * 1. Deploy dedicated resolver
 * 2. Generate commitment
 * 3. Submit commitment transaction
 * 4. Wait for commitment confirmation
 * 5. Approve token spend
 * 6. Wait for approval confirmation
 * 7. Submit registration transaction
 * 8. Wait for registration confirmation
 *
 * Persistence is handled automatically via inspect option (see export at bottom)
 */

type CommitmentData = {
  commitment: Hash
  secret: Hex
}

// V2 contracts don't require commitment wait time when using FastTestETHRegistrar
// This is only used as fallback for non-fast registrar
const COMMITMENT_WAIT_DURATION_MS = 60_000

/**
 * Fixed transaction IDs used by the registration machine.
 * These allow the TransactionModal to track each step by a predictable ID.
 */
export const REGISTRATION_TX_IDS = {
  deployResolver: 'tx-reg-deploy-resolver',
  commit: 'tx-reg-commit',
  approve: 'tx-reg-approve',
  register: 'tx-reg-register',
} as const

export type RegistrationContext = {
  // Account & client
  signer?: Signer
  accountAddress?: Address
  ownerAddress?: Address // EOA owner address (for HCA, this differs from accountAddress)
  publicClient?: PublicClient
  chainId: number

  // Registration params
  name: string
  duration: bigint
  selectedToken: 'USDC' | 'DAI'
  tokenPrice: bigint
  useFastRegistrar: boolean
  sponsored?: boolean

  // Flow state
  resolverTxId?: string
  resolverSalt?: bigint
  resolverAddress?: Address
  commitment?: CommitmentData
  commitmentTxId?: string
  approvalTxId?: string
  registrationTxId?: string
  registerReadyTimestamp?: number
  registrationStartedAt?: number

  // Error state
  error?: Error
  /** The state to return to on RETRY — set when entering error state */
  retryTarget?:
    | 'deployingResolver'
    | 'committingTransaction'
    | 'approvingToken'
    | 'registeringDomain'
}

export type RegistrationEvent =
  | {
      type: 'START_REGISTRATION'
      name: string
      /** Duration in seconds */
      duration: bigint
      token: 'USDC' | 'DAI'
      price: bigint
      signer: Signer
      accountAddress: Address
      ownerAddress?: Address // EOA owner address (for HCA, this differs from accountAddress)
      publicClient: PublicClient
      useFastRegistrar?: boolean
      sponsored?: boolean
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
    deployResolver: fromResultAsync(
      (input: {
        name: string
        owner: Address
        signer: Signer
        publicClient: PublicClient
        sponsored?: boolean
        id?: string
      }) => {
        return submitResolverDeploymentActor(input)
      },
    ),
    resolveResolverDeployment: fromResultAsync((input: { txId: string }) => {
      return resolveResolverDeploymentActor(input)
    }),
    generateCommitment: fromResultAsync(
      ({
        name,
        owner,
        duration,
        publicClient,
        selectedToken,
        useFastRegistrar,
        resolverAddress,
      }: {
        name: string
        owner: Address
        duration: bigint
        publicClient: PublicClient
        selectedToken: 'USDC' | 'DAI'
        useFastRegistrar: boolean
        resolverAddress: Address
      }) => {
        return generateCommitmentActor({
          name,
          owner,
          duration,
          publicClient,
          selectedToken,
          useFastRegistrar,
          resolverAddress,
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
        useFastRegistrar: boolean
        sponsored?: boolean
        id?: string
      }) => {
        return submitCommitmentActor(input)
      },
    ),
    submitApproval: fromResultAsync(
      (input: {
        tokenPrice: bigint
        selectedToken: 'USDC' | 'DAI'
        signer: Signer
        publicClient: PublicClient
        useFastRegistrar: boolean
        sponsored?: boolean
        id?: string
      }) => {
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
        useFastRegistrar: boolean
        sponsored?: boolean
        resolverAddress: Address
        id?: string
      }) => {
        return submitRegistrationActor(input)
      },
    ),
    submitApprovalAndRegistration: fromResultAsync(
      (input: {
        tokenPrice: bigint
        selectedToken: 'USDC' | 'DAI'
        name: string
        commitment: CommitmentData
        signer: Signer
        duration: bigint
        owner: Address
        publicClient: PublicClient
        useFastRegistrar: boolean
        sponsored?: boolean
        resolverAddress: Address
      }) => {
        return submitApprovalAndRegistrationActor(input)
      },
    ),
    pollTransactionStatus: fromResultAsync((input: { txId: string }) => {
      return pollTransactionStatusActor(input)
    }),
    waitAfterCommitment: fromPromise(
      async ({ input }: { input: { delayMs: number } }) => {
        const safeDelay = Math.max(0, input.delayMs)
        await new Promise<void>((resolve) => setTimeout(resolve, safeDelay))
      },
    ),
    validateCommitment: fromResultAsync(
      (input: {
        commitment: CommitmentData
        publicClient: PublicClient
        useFastRegistrar: boolean
      }) => {
        return validateCommitmentActor(input)
      },
    ),
    readMinCommitmentAge: fromResultAsync(
      (input: { publicClient: PublicClient; useFastRegistrar: boolean }) => {
        return readMinCommitmentAgeActor(input)
      },
    ),
    readPaymentTokenAllowance: fromResultAsync(
      (input: {
        owner: Address
        selectedToken: 'USDC' | 'DAI'
        publicClient: PublicClient
        useFastRegistrar: boolean
      }) => {
        return readPaymentTokenAllowanceActor(input)
      },
    ),
  },

  guards: {
    isRhinestoneSigner: ({ context }) => context.signer?.type === 'rhinestone',
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
            resolverTxId: context.resolverTxId,
            resolverAddress: context.resolverAddress,
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

    clearRegisterReadyTimestamp: assign({
      registerReadyTimestamp: () => undefined,
    }),

    logRegistrationDuration: ({ context }) => {
      if (
        !context.registrationStartedAt ||
        context.signer?.type !== 'rhinestone'
      ) {
        return
      }

      const totalMs = Date.now() - context.registrationStartedAt
      const totalSeconds = totalMs / 1000

      console.log('✅ [REGISTRATION] START_REGISTRATION elapsed:', {
        name: context.name,
        signerType: context.signer?.type,
        elapsedMs: totalMs,
        elapsedSeconds: Number(totalSeconds.toFixed(2)),
      })
    },

    logRegistrationFailureDuration: ({ context }) => {
      if (
        !context.registrationStartedAt ||
        context.signer?.type !== 'rhinestone'
      ) {
        return
      }

      const totalMs = Date.now() - context.registrationStartedAt
      const totalSeconds = totalMs / 1000

      console.error('❌ [REGISTRATION] START_REGISTRATION elapsed:', {
        name: context.name,
        signerType: context.signer?.type,
        elapsedMs: totalMs,
        elapsedSeconds: Number(totalSeconds.toFixed(2)),
        error: context.error?.message,
        errorName: context.error?.name,
      })
    },
  },

  // Note: Persistence will be handled via inspect option (see export at bottom)
}).createMachine({
  id: 'registration',
  initial: 'idle',

  context: ({ input }) => ({
    signer: undefined,
    accountAddress: undefined,
    ownerAddress: undefined,
    publicClient: undefined,
    chainId: input.chainId,
    name: '',
    duration: 0n,
    selectedToken: 'USDC',
    tokenPrice: 0n,
    registrationStartedAt: undefined,
    registerReadyTimestamp: undefined,
    useFastRegistrar: false,
    resolverAddress: undefined,
    resolverTxId: undefined,
    resolverSalt: undefined,
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
            registrationStartedAt: ({ event }) =>
              event.signer.type === 'rhinestone' ? Date.now() : undefined,
            ownerAddress: ({ event }) =>
              event.ownerAddress ?? event.accountAddress, // Default to accountAddress if not provided
            publicClient: ({ event }) => event.publicClient,
            registerReadyTimestamp: () => undefined,
            useFastRegistrar: ({ event }) => Boolean(event.useFastRegistrar),
            sponsored: ({ event }) => event.sponsored ?? true,
            resolverAddress: () => undefined,
            resolverTxId: () => undefined,
            resolverSalt: () => undefined,
            commitment: () => undefined,
            commitmentTxId: () => undefined,
            approvalTxId: () => undefined,
            registrationTxId: () => undefined,
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
        target: 'deployingResolver',
      },
    },

    deployingResolver: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'deployResolver',
        input: ({ context }) => ({
          name: context.name,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner: context.ownerAddress ?? context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          sponsored: context.sponsored,
          id: REGISTRATION_TX_IDS.deployResolver,
        }),
        onDone: {
          target: 'waitingForResolverDeployment',
          actions: assign({
            resolverTxId: ({ event }) => event.output.txId,
            resolverSalt: ({ event }) => event.output.salt,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'deployingResolver' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Resolver deployment submission failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForResolverDeployment: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'resolveResolverDeployment',
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.resolverTxId! }),
        onDone: {
          target: 'preparingCommitment',
          actions: assign({
            resolverAddress: ({ event }) => event.output.resolverAddress,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'deployingResolver' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Resolver deployment failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
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
            // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
            owner: context.ownerAddress ?? context.accountAddress!,
            duration: context.duration,
            // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
            publicClient: context.publicClient!,
            selectedToken: context.selectedToken,
            useFastRegistrar: context.useFastRegistrar,
            // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
            resolverAddress: context.resolverAddress!,
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
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'committingTransaction' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Commitment preparation failed:',
                event.error,
              )
            },
          ],
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
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          commitment: context.commitment!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          name: context.name,
          duration: context.duration,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          useFastRegistrar: context.useFastRegistrar,
          sponsored: context.sponsored,
          id: REGISTRATION_TX_IDS.commit,
        }),
        onDone: {
          target: 'waitingForCommitment',
          actions: assign({
            commitmentTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'committingTransaction' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Commitment submission failed:',
                event.error,
              )
            },
          ],
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
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.commitmentTxId! }),
        onDone: {
          target: 'fetchingCommitmentAge',
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'committingTransaction' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Commitment transaction failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    fetchingCommitmentAge: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'readMinCommitmentAge',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          useFastRegistrar: context.useFastRegistrar,
        }),
        onDone: {
          target: 'commitmentCooldown',
          actions: assign({
            registerReadyTimestamp: ({ event }) => {
              const minAgeSeconds = Number(event.output as bigint)
              return Date.now() + minAgeSeconds * 1000
            },
          }),
        },
        onError: {
          // Fall back to the default cooldown so registration can still
          // proceed even if the read fails.
          target: 'commitmentCooldown',
          actions: assign({
            registerReadyTimestamp: () =>
              Date.now() + COMMITMENT_WAIT_DURATION_MS,
          }),
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    validatingCommitment: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'validateCommitment',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          commitment: context.commitment!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          useFastRegistrar: context.useFastRegistrar,
        }),
        onDone: [
          {
            guard: 'isRhinestoneSigner',
            target: 'submittingRhinestoneBundle',
          },
          { target: 'checkingAllowance' },
        ],
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'committingTransaction' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Commitment validation failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    commitmentCooldown: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'waitAfterCommitment',
        input: ({ context }) => {
          const targetTimestamp =
            context.registerReadyTimestamp ??
            Date.now() + COMMITMENT_WAIT_DURATION_MS
          const delayMs = Math.max(0, targetTimestamp - Date.now())
          return { delayMs }
        },
        onDone: [
          {
            guard: 'isRhinestoneSigner',
            target: 'submittingRhinestoneBundle',
          },
          { target: 'checkingAllowance' },
        ],
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error as Error,
            retryTarget: () => 'committingTransaction' as const,
          }),
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    submittingRhinestoneBundle: {
      entry: [
        'logTransition',
        'recordTransition',
        'clearRegisterReadyTimestamp',
      ],
      invoke: {
        src: 'submitApprovalAndRegistration',
        input: ({ context }) => ({
          tokenPrice: context.tokenPrice,
          selectedToken: context.selectedToken,
          name: context.name,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          commitment: context.commitment!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          duration: context.duration,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner: context.ownerAddress ?? context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          useFastRegistrar: context.useFastRegistrar,
          sponsored: context.sponsored,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          resolverAddress: context.resolverAddress!,
        }),
        onDone: {
          target: 'waitingForRhinestoneBundle',
          actions: assign({
            registrationTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Approve+register bundle submission failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForRhinestoneBundle: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.registrationTxId! }),
        onDone: 'success',
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Approve+register bundle failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    checkingAllowance: {
      entry: [
        'logTransition',
        'recordTransition',
        'clearRegisterReadyTimestamp',
      ],
      invoke: {
        src: 'readPaymentTokenAllowance',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner: context.ownerAddress ?? context.accountAddress!,
          selectedToken: context.selectedToken,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          useFastRegistrar: context.useFastRegistrar,
        }),
        onDone: [
          {
            // Skip approval entirely when the registrar already has enough
            // allowance for this registration's price.
            guard: ({ context, event }) => {
              const allowance = event.output as bigint
              return allowance >= context.tokenPrice
            },
            target: 'registeringDomain',
          },
          { target: 'approvingToken' },
        ],
        onError: {
          // If the read fails for any reason, fall back to running the
          // approval step rather than blocking the flow.
          target: 'approvingToken',
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    approvingToken: {
      entry: [
        'logTransition',
        'recordTransition',
        'clearRegisterReadyTimestamp',
      ],
      invoke: {
        src: 'submitApproval',
        input: ({ context }) => ({
          tokenPrice: context.tokenPrice,
          selectedToken: context.selectedToken,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          useFastRegistrar: context.useFastRegistrar,
          sponsored: context.sponsored,
          id: REGISTRATION_TX_IDS.approve,
        }),
        onDone: {
          target: 'waitingForApproval',
          actions: assign({
            approvalTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'approvingToken' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Token approval submission failed:',
                event.error,
              )
            },
          ],
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
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.approvalTxId! }),
        onDone: 'registeringDomain',
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'approvingToken' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Token approval transaction failed:',
                event.error,
              )
            },
          ],
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
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          commitment: context.commitment!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          duration: context.duration,
          selectedToken: context.selectedToken,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner: context.ownerAddress ?? context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          useFastRegistrar: context.useFastRegistrar,
          sponsored: context.sponsored,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          resolverAddress: context.resolverAddress!,
          id: REGISTRATION_TX_IDS.register,
        }),
        onDone: {
          target: 'waitingForRegistration',
          actions: assign({
            registrationTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'registeringDomain' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Registration submission failed:',
                event.error,
              )
            },
          ],
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
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.registrationTxId! }),
        onDone: 'success',
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'registeringDomain' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Registration transaction failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    success: {
      // Not `type: 'final'` so `CANCEL` can return to `idle` for a new registration
      // (e.g. register-v2 after another name); `START_REGISTRATION` only runs from `idle`.
      entry: [
        'logTransition',
        'recordTransition',
        'logRegistrationDuration',
        'clearSnapshot',
      ],
      on: {
        CANCEL: {
          target: 'idle',
        },
      },
    },

    error: {
      entry: [
        'logTransition',
        'recordTransition',
        'logRegistrationFailureDuration',
        ({ context }) => {
          console.error('❌ [REGISTRATION MACHINE] Entered error state:', {
            error: context.error?.message,
            errorName: context.error?.name,
            errorStack: context.error?.stack,
            registrationTxId: context.registrationTxId,
            approvalTxId: context.approvalTxId,
            commitmentTxId: context.commitmentTxId,
          })
        },
      ],
      on: {
        RETRY: [
          {
            guard: ({ context }) => context.retryTarget === 'registeringDomain',
            target: 'registeringDomain',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              registrationTxId: undefined,
            })),
          },
          {
            guard: ({ context }) => context.retryTarget === 'approvingToken',
            target: 'approvingToken',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              approvalTxId: undefined,
              registrationTxId: undefined,
            })),
          },
          {
            guard: ({ context }) =>
              context.retryTarget === 'committingTransaction',
            target: 'committingTransaction',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              commitmentTxId: undefined,
              approvalTxId: undefined,
              registrationTxId: undefined,
              registerReadyTimestamp: undefined,
            })),
          },
          {
            target: 'deployingResolver',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              resolverAddress: undefined,
              resolverTxId: undefined,
              resolverSalt: undefined,
              commitment: undefined,
              commitmentTxId: undefined,
              approvalTxId: undefined,
              registrationTxId: undefined,
              registerReadyTimestamp: undefined,
            })),
          },
        ],
        CANCEL: 'idle',
      },
    },
  },
})

// TODO: Add persistence wrapper with inspect option
// const savedSnapshot = await persistenceService.loadRegistrationSnapshot()
// export const registrationMachine = savedSnapshot
//   ? baseMachine.provide({ snapshot: savedSnapshot })
