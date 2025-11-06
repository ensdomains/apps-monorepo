import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import { err, errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow'
import type { Address, Hash, Hex, PublicClient } from 'viem'
import { type ActorLogic, assign, fromPromise, setup } from 'xstate'
import { submitEOATransaction } from '../actors/eoa-transport.actor'
import { submitRhinestoneTransaction } from '../actors/rhinestone-transport.actor'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import * as auditTrail from '../services/audit-trail.service'
import type { Signer } from '../types/signer.types'
import type { TransactionOptions } from '../types/transaction.types'
import {
  type CommitmentData,
  checkCommitmentAge,
  type ENSRegistrationParams,
  generateSecret,
  getRegistrationPrice,
  makeCommitment,
  prepareCommitTransaction,
  prepareRegisterTransaction,
  prepareTokenApproval,
  type RegistrationPricing,
} from './ens-registration.helpers'

// ============================================================================
// Constants
// ============================================================================

const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'
const STORAGE_KEY_PREFIX = 'ens_registration_'

// ============================================================================
// Types
// ============================================================================

interface ENSRegistrationContext {
  // Input params
  params: ENSRegistrationParams
  publicClient: PublicClient
  signer: Signer
  options: TransactionOptions

  // Generated data
  secret?: Hex
  commitment?: Hex
  pricing?: RegistrationPricing

  // Transaction hashes
  approvalHash?: Hash
  commitHash?: Hash
  registerHash?: Hash

  // State
  error?: Error
  retryCount: number
  needsApproval: boolean
}

type ENSRegistrationEvent =
  | { type: 'START' }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'PROCEED_TO_REGISTER' } // Manual trigger after waiting (if needed)

// ============================================================================
// Persistence Helpers
// ============================================================================

function saveToStorage(key: string, value: any): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${key}`, JSON.stringify(value))
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
    }
  }
}

function loadFromStorage<T>(key: string): T | undefined {
  if (typeof window !== 'undefined') {
    try {
      const value = localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`)
      return value ? JSON.parse(value) : undefined
    } catch (error) {
      console.error('Failed to load from localStorage:', error)
      return undefined
    }
  }
  return undefined
}

function clearStorage(): void {
  if (typeof window !== 'undefined') {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(STORAGE_KEY_PREFIX)) {
          localStorage.removeItem(key)
        }
      })
    } catch (error) {
      console.error('Failed to clear localStorage:', error)
    }
  }
}

// ============================================================================
// Actor Helpers
// ============================================================================

/**
 * Submit a transaction using the appropriate transport (EOA or Rhinestone)
 */
function submitTransaction(
  transactionData: { to: Address; data: Hex; value: bigint },
  signer: Signer,
  publicClient: PublicClient,
): ResultAsync<Hash, TransactionSubmissionError> {
  if (signer.type === 'eoa') {
    return submitEOATransaction({
      request: {
        type: 'eoa',
        from: signer.walletClient.account?.address || ZERO_ADDRESS,
        to: transactionData.to,
        data: transactionData.data,
        value: transactionData.value,
        chainId: publicClient.chain?.id || 1,
      },
      signer,
    })
  }

  if (signer.type === 'rhinestone') {
    return submitRhinestoneTransaction({
      request: {
        type: 'rhinestone-intent',
        from: signer.account.address,
        to: transactionData.to,
        data: transactionData.data,
        value: transactionData.value,
        chainId: publicClient.chain?.id || 1,
      },
      signer,
      publicClient,
    })
  }

  return errAsync(
    new TransactionSubmissionError(
      {
        type: 'eoa',
        from: ZERO_ADDRESS,
        to: transactionData.to,
        chainId: publicClient.chain?.id || 1,
      },
      new Error(`Unsupported signer type: ${signer.type}`),
    ),
  )
}

/**
 * Submit batched transactions for Rhinestone (approval + register)
 */
function submitBatchedTransaction(
  calls: Array<{ to: Address; data: Hex; value: bigint }>,
  signer: Signer,
  publicClient: PublicClient,
): ResultAsync<Hash, TransactionSubmissionError> {
  if (signer.type !== 'rhinestone') {
    return errAsync(
      new TransactionSubmissionError(
        {
          type: 'eoa',
          from: ZERO_ADDRESS,
          to: ZERO_ADDRESS,
          chainId: publicClient.chain?.id || 1,
        },
        new Error('Batched transactions only supported for Rhinestone signers'),
      ),
    )
  }

  // For now, just submit the first call
  // TODO: Implement actual batching when Rhinestone SDK supports it
  return submitTransaction(calls[0], signer, publicClient)
}

// ============================================================================
// State Machine
// ============================================================================

export const ensRegistrationMachine: ActorLogic<any, any, any, any, any> =
  setup({
    types: {
      context: {} as ENSRegistrationContext,
      input: {} as {
        params: ENSRegistrationParams
        publicClient: PublicClient
        signer: Signer
        options?: TransactionOptions
      },
      events: {} as ENSRegistrationEvent,
    },
    actors: {
      /**
       * Prepare registration: generate secret, make commitment, get pricing
       */
      prepare: fromResultAsync(
        ({
          context,
        }: {
          context: ENSRegistrationContext
        }): ResultAsync<
          { secret: Hex; commitment: Hex; pricing: RegistrationPricing },
          Error
        > => {
          const { params, publicClient } = context

          console.log('🔧 [ENS REGISTRATION] Preparing registration:', {
            name: params.name,
            duration: params.duration.toString(),
          })

          // Generate secret
          const secret = generateSecret()
          console.log('🔑 [ENS REGISTRATION] Generated secret')

          // Make commitment and get pricing in parallel - convert Promise<Result> to ResultAsync
          const commitmentResult = ResultAsync.fromPromise(
            makeCommitment(params, secret, publicClient),
            (error) => error as Error,
          ).andThen((result) => result)

          const pricingResult = ResultAsync.fromPromise(
            getRegistrationPrice(params, publicClient),
            (error) => error as Error,
          ).andThen((result) => result)

          return ResultAsync.combine([commitmentResult, pricingResult]).map(
            ([commitment, pricing]) => {
              console.log('✅ [ENS REGISTRATION] Preparation complete:', {
                commitment,
                pricing,
              })

              return { secret, commitment, pricing }
            },
          )
        },
      ),

      /**
       * Check if token approval is needed and prepare approval transaction
       */
      checkApproval: fromResultAsync(
        ({
          context,
        }: {
          context: ENSRegistrationContext
        }): ResultAsync<
          {
            needsApproval: boolean
            approvalData?: { to: Address; data: Hex; value: bigint }
          },
          Error
        > => {
          const { params, publicClient, signer, pricing } = context

          // If paying with ETH, no approval needed
          if (params.paymentToken === ZERO_ADDRESS) {
            return okAsync({ needsApproval: false })
          }

          if (!pricing) {
            return errAsync(new Error('Pricing not available'))
          }

          const owner =
            signer.type === 'eoa'
              ? signer.walletClient.account?.address || ZERO_ADDRESS
              : signer.type === 'rhinestone'
                ? signer.account.address
                : ZERO_ADDRESS

          return ResultAsync.fromPromise(
            prepareTokenApproval(
              {
                tokenAddress: params.paymentToken,
                spender: params.registrarAddress,
                amount: pricing.total,
                owner,
              },
              publicClient,
            ),
            (error) => error as Error,
          )
            .andThen((result) => result) // Unwrap Promise<Result> -> ResultAsync
            .andThen((approvalData) =>
              okAsync({
                needsApproval: approvalData.needsApproval,
                approvalData: approvalData.needsApproval
                  ? {
                      to: approvalData.to,
                      data: approvalData.data,
                      value: approvalData.value,
                    }
                  : undefined,
              }),
            )
        },
      ),

      /**
       * Submit approval transaction
       */
      submitApproval: fromResultAsync(
        ({
          context,
        }: {
          context: ENSRegistrationContext
        }): ResultAsync<Hash, TransactionSubmissionError> => {
          const { params, signer, publicClient, pricing } = context

          if (!pricing) {
            return errAsync(
              new TransactionSubmissionError(
                {
                  type: 'eoa',
                  from: ZERO_ADDRESS,
                  to: ZERO_ADDRESS,
                  chainId: publicClient.chain?.id || 1,
                },
                new Error('Pricing not available'),
              ),
            )
          }

          const owner =
            signer.type === 'eoa'
              ? signer.walletClient.account?.address || ZERO_ADDRESS
              : signer.type === 'rhinestone'
                ? signer.account.address
                : ZERO_ADDRESS

          return ResultAsync.fromPromise(
            prepareTokenApproval(
              {
                tokenAddress: params.paymentToken,
                spender: params.registrarAddress,
                amount: pricing.total,
                owner,
              },
              publicClient,
            ),
            (error) =>
              new TransactionSubmissionError(
                {
                  type: 'eoa',
                  from: ZERO_ADDRESS,
                  to: ZERO_ADDRESS,
                  chainId: publicClient.chain?.id || 1,
                },
                error as Error,
              ),
          )
            .andThen((result) => result) // Unwrap Promise<Result> -> ResultAsync
            .andThen((approvalData) => {
              if (!approvalData.needsApproval) {
                return errAsync(
                  new TransactionSubmissionError(
                    {
                      type: 'eoa',
                      from: ZERO_ADDRESS,
                      to: ZERO_ADDRESS,
                      chainId: publicClient.chain?.id || 1,
                    },
                    new Error('Approval not needed'),
                  ),
                )
              }

              console.log(
                '💰 [ENS REGISTRATION] Submitting approval transaction',
              )
              return submitTransaction(
                {
                  to: approvalData.to,
                  data: approvalData.data,
                  value: approvalData.value,
                },
                signer,
                publicClient,
              )
            })
            .mapErr((error) =>
              error instanceof TransactionSubmissionError
                ? error
                : new TransactionSubmissionError(
                    {
                      type: 'eoa',
                      from: ZERO_ADDRESS,
                      to: ZERO_ADDRESS,
                      chainId: publicClient.chain?.id || 1,
                    },
                    error,
                  ),
            )
        },
      ),

      /**
       * Submit commit transaction
       */
      submitCommit: fromResultAsync(
        ({
          context,
        }: {
          context: ENSRegistrationContext
        }): ResultAsync<Hash, TransactionSubmissionError> => {
          const { params, commitment, signer, publicClient } = context

          if (!commitment) {
            return errAsync(
              new TransactionSubmissionError(
                {
                  type: 'eoa',
                  from: ZERO_ADDRESS,
                  to: ZERO_ADDRESS,
                  chainId: publicClient.chain?.id || 1,
                },
                new Error('Commitment not available'),
              ),
            )
          }

          const commitData = prepareCommitTransaction(params, commitment)
          if (commitData.isErr()) {
            return errAsync(
              new TransactionSubmissionError(
                {
                  type: 'eoa',
                  from: ZERO_ADDRESS,
                  to: ZERO_ADDRESS,
                  chainId: publicClient.chain?.id || 1,
                },
                commitData.error,
              ),
            )
          }

          console.log('📝 [ENS REGISTRATION] Submitting commit transaction')
          return submitTransaction(commitData.value, signer, publicClient)
        },
      ),

      /**
       * Wait for confirmation and check commitment age
       */
      waitForCommitment: fromPromise(
        async ({
          input,
        }: {
          input: { hash: Hash; publicClient: PublicClient }
        }) => {
          const { hash, publicClient } = input

          console.log(
            '⏳ [ENS REGISTRATION] Waiting for commit confirmation:',
            hash,
          )

          // Wait for transaction confirmation
          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
            confirmations: 1,
          })

          if (receipt.status === 'reverted') {
            throw new Error('Commit transaction reverted')
          }

          console.log('✅ [ENS REGISTRATION] Commit confirmed')
          return receipt
        },
      ),

      /**
       * Submit register transaction (or batched approval + register for Rhinestone)
       */
      submitRegister: fromResultAsync(
        ({
          context,
        }: {
          context: ENSRegistrationContext
        }): ResultAsync<Hash, TransactionSubmissionError> => {
          const {
            params,
            secret,
            signer,
            publicClient,
            needsApproval,
            pricing,
          } = context

          if (!secret) {
            return errAsync(
              new TransactionSubmissionError(
                {
                  type: 'eoa',
                  from: ZERO_ADDRESS,
                  to: ZERO_ADDRESS,
                  chainId: publicClient.chain?.id || 1,
                },
                new Error('Secret not available'),
              ),
            )
          }

          const registerData = prepareRegisterTransaction(params, secret)
          if (registerData.isErr()) {
            return errAsync(
              new TransactionSubmissionError(
                {
                  type: 'eoa',
                  from: ZERO_ADDRESS,
                  to: ZERO_ADDRESS,
                  chainId: publicClient.chain?.id || 1,
                },
                registerData.error,
              ),
            )
          }

          // For Rhinestone with token payments, batch approval + register
          if (
            signer.type === 'rhinestone' &&
            needsApproval &&
            params.paymentToken !== ZERO_ADDRESS &&
            pricing
          ) {
            const owner = signer.account.address

            return ResultAsync.fromPromise(
              prepareTokenApproval(
                {
                  tokenAddress: params.paymentToken,
                  spender: params.registrarAddress,
                  amount: pricing.total,
                  owner,
                },
                publicClient,
              ),
              (error) =>
                new TransactionSubmissionError(
                  {
                    type: 'eoa',
                    from: ZERO_ADDRESS,
                    to: ZERO_ADDRESS,
                    chainId: publicClient.chain?.id || 1,
                  },
                  error as Error,
                ),
            )
              .andThen((result) => result) // Unwrap Promise<Result> -> ResultAsync
              .andThen((approvalData) => {
                if (approvalData.needsApproval) {
                  console.log(
                    '🔄 [ENS REGISTRATION] Batching approval + register for Rhinestone',
                  )
                  return submitBatchedTransaction(
                    [
                      {
                        to: approvalData.to,
                        data: approvalData.data,
                        value: approvalData.value,
                      },
                      registerData.value,
                    ],
                    signer,
                    publicClient,
                  )
                }

                console.log(
                  '🎯 [ENS REGISTRATION] Submitting register transaction',
                )
                return submitTransaction(
                  registerData.value,
                  signer,
                  publicClient,
                )
              })
              .mapErr((error) =>
                error instanceof TransactionSubmissionError
                  ? error
                  : new TransactionSubmissionError(
                      {
                        type: 'eoa',
                        from: ZERO_ADDRESS,
                        to: ZERO_ADDRESS,
                        chainId: publicClient.chain?.id || 1,
                      },
                      error,
                    ),
              )
          }

          console.log('🎯 [ENS REGISTRATION] Submitting register transaction')
          return submitTransaction(
            registerData.value,
            signer,
            publicClient,
          ).mapErr((error) =>
            error instanceof TransactionSubmissionError
              ? error
              : new TransactionSubmissionError(
                  {
                    type: 'eoa',
                    from: ZERO_ADDRESS,
                    to: ZERO_ADDRESS,
                    chainId: publicClient.chain?.id || 1,
                  },
                  error,
                ),
          )
        },
      ),

      /**
       * Wait for register confirmation
       */
      waitForRegister: fromPromise(
        async ({
          input,
        }: {
          input: { hash: Hash; publicClient: PublicClient }
        }) => {
          const { hash, publicClient } = input

          console.log(
            '⏳ [ENS REGISTRATION] Waiting for register confirmation:',
            hash,
          )

          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
            confirmations: 1,
          })

          if (receipt.status === 'reverted') {
            throw new Error('Register transaction reverted')
          }

          console.log('✅ [ENS REGISTRATION] Registration complete!')
          return receipt
        },
      ),
    },
    guards: {
      canRetry: ({ context }) =>
        context.retryCount < (context.options.retryCount || 3),
      needsApproval: ({ context }) => context.needsApproval,
    },
    actions: {
      recordTransition: ({ context, self, event }) => {
        try {
          const state = self.getSnapshot()
          auditTrail.recordTransition({
            machineId: 'ens-registration',
            fromState:
              state.status === 'active' ? String(state.value) : 'unknown',
            toState: String(state.value),
            event: event?.type || 'unknown',
            context: {
              name: context.params.name,
              commitHash: context.commitHash,
              registerHash: context.registerHash,
              error: context.error?.message,
            },
            metadata: {
              transactionHash: context.registerHash || context.commitHash,
            },
          })
        } catch (error) {
          console.error(
            '[ENS REGISTRATION] Failed to record transition:',
            error,
          )
        }
      },

      saveSecret: assign({
        secret: ({ event }) =>
          'output' in event &&
          event.output &&
          typeof event.output === 'object' &&
          'secret' in event.output
            ? (event.output.secret as Hex)
            : undefined,
      }),

      saveCommitment: assign({
        commitment: ({ event }) =>
          'output' in event &&
          event.output &&
          typeof event.output === 'object' &&
          'commitment' in event.output
            ? (event.output.commitment as Hex)
            : undefined,
      }),

      savePricing: assign({
        pricing: ({ event }) =>
          'output' in event &&
          event.output &&
          typeof event.output === 'object' &&
          'pricing' in event.output
            ? (event.output.pricing as RegistrationPricing)
            : undefined,
      }),

      saveApprovalNeeded: assign({
        needsApproval: ({ event }) =>
          'output' in event &&
          event.output &&
          typeof event.output === 'object' &&
          'needsApproval' in event.output
            ? (event.output.needsApproval as boolean)
            : false,
      }),

      saveApprovalHash: assign({
        approvalHash: ({ event }) =>
          'output' in event ? (event.output as Hash) : undefined,
      }),

      saveCommitHash: assign({
        commitHash: ({ event }) =>
          'output' in event ? (event.output as Hash) : undefined,
      }),

      saveRegisterHash: assign({
        registerHash: ({ event }) =>
          'output' in event ? (event.output as Hash) : undefined,
      }),

      saveError: assign({
        error: ({ event }) =>
          'error' in event ? (event.error as Error) : undefined,
      }),

      incrementRetry: assign({
        retryCount: ({ context }) => context.retryCount + 1,
      }),

      clearError: assign({
        error: () => undefined,
      }),

      persistData: ({ context }) => {
        saveToStorage('secret', context.secret)
        saveToStorage('commitment', context.commitment)
        saveToStorage('commitHash', context.commitHash)
        saveToStorage('params', context.params)
      },

      clearPersistedData: () => {
        clearStorage()
      },
    },
  }).createMachine({
    id: 'ens-registration',
    initial: 'idle',
    context: ({ input }) => ({
      params: input.params,
      publicClient: input.publicClient,
      signer: input.signer,
      options: input.options || {},
      retryCount: 0,
      needsApproval: false,
      // Try to restore from localStorage
      secret: loadFromStorage('secret'),
      commitment: loadFromStorage('commitment'),
      commitHash: loadFromStorage('commitHash'),
    }),
    states: {
      idle: {
        entry: ['recordTransition'],
        on: {
          START: 'preparing',
        },
      },

      preparing: {
        entry: ['recordTransition'],
        invoke: {
          src: 'prepare',
          input: ({ context }) => ({ context }),
          onDone: {
            target: 'checkingApproval',
            actions: [
              assign({
                secret: ({ event }) => event.output.secret,
                commitment: ({ event }) => event.output.commitment,
                pricing: ({ event }) => event.output.pricing,
              }),
              'persistData',
            ],
          },
          onError: {
            target: 'error',
            actions: ['saveError'],
          },
        },
      },

      checkingApproval: {
        entry: ['recordTransition'],
        invoke: {
          src: 'checkApproval',
          input: ({ context }) => ({ context }),
          onDone: [
            {
              target: 'approvingToken',
              guard: ({ event }) => event.output.needsApproval,
              actions: [
                assign({
                  needsApproval: () => true,
                }),
              ],
            },
            {
              target: 'committing',
              actions: [
                assign({
                  needsApproval: () => false,
                }),
              ],
            },
          ],
          onError: {
            target: 'error',
            actions: ['saveError'],
          },
        },
      },

      approvingToken: {
        entry: ['recordTransition'],
        invoke: {
          src: 'submitApproval',
          input: ({ context }) => ({ context }),
          onDone: {
            target: 'waitingForApproval',
            actions: ['saveApprovalHash', 'persistData'],
          },
          onError: {
            target: 'error',
            actions: ['saveError'],
          },
        },
      },

      waitingForApproval: {
        entry: ['recordTransition'],
        invoke: {
          src: 'waitForRegister',
          input: ({ context }) => ({
            hash: context.approvalHash!,
            publicClient: context.publicClient,
          }),
          onDone: 'committing',
          onError: {
            target: 'error',
            actions: ['saveError'],
          },
        },
      },

      committing: {
        entry: ['recordTransition'],
        invoke: {
          src: 'submitCommit',
          input: ({ context }) => ({ context }),
          onDone: {
            target: 'waitingForCommit',
            actions: ['saveCommitHash', 'persistData'],
          },
          onError: {
            target: 'error',
            actions: ['saveError'],
          },
        },
      },

      waitingForCommit: {
        entry: ['recordTransition'],
        invoke: {
          src: 'waitForCommitment',
          input: ({ context }) => ({
            hash: context.commitHash!,
            publicClient: context.publicClient,
          }),
          onDone: 'waiting',
          onError: {
            target: 'error',
            actions: ['saveError'],
          },
        },
      },

      waiting: {
        entry: ['recordTransition'],
        // For FastTestETHRegistrar, MIN_COMMITMENT_AGE is 0, so we can proceed immediately
        // In the future, add timer/polling logic here if needed
        always: 'registering',
        on: {
          PROCEED_TO_REGISTER: 'registering',
        },
      },

      registering: {
        entry: ['recordTransition'],
        invoke: {
          src: 'submitRegister',
          input: ({ context }) => ({ context }),
          onDone: {
            target: 'waitingForRegister',
            actions: ['saveRegisterHash', 'persistData'],
          },
          onError: {
            target: 'error',
            actions: ['saveError'],
          },
        },
      },

      waitingForRegister: {
        entry: ['recordTransition'],
        invoke: {
          src: 'waitForRegister',
          input: ({ context }) => ({
            hash: context.registerHash!,
            publicClient: context.publicClient,
          }),
          onDone: {
            target: 'success',
            actions: ['clearPersistedData'],
          },
          onError: {
            target: 'error',
            actions: ['saveError'],
          },
        },
      },

      success: {
        entry: ['recordTransition'],
        type: 'final',
      },

      error: {
        entry: ['recordTransition'],
        on: {
          RETRY: [
            {
              target: 'preparing',
              guard: 'canRetry',
              actions: ['incrementRetry', 'clearError'],
            },
          ],
          CANCEL: 'idle',
        },
      },
    },
  })
