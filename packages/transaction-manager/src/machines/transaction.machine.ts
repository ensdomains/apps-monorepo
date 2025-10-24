import { setup, assign, fromPromise, type ActorLogic } from 'xstate'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import { ResultAsync, errAsync } from 'neverthrow'
import { fromPromise as fromPromiseNT } from 'neverthrow'
import type { Hash, TransactionReceipt, PublicClient, WalletClient } from 'viem'
import type {
  TransactionRequest,
  TransactionOptions,
  TransactionModalState,
  RhinestoneConfig,
  EOATransactionRequest,
} from '../types/transaction.types'
import { submitEOATransaction } from '../actors/eoa-transport.actor'
import { submitRhinestoneTransaction } from '../actors/rhinestone-transport.actor'
import * as auditTrail from '../services/audit-trail.service'
import {
  TransactionSubmissionError,
  TransactionTimeoutError,
  TransactionRevertedError,
  EthCallFallbackError,
} from '../errors/transaction.errors'

/**
 * Base Transaction Machine
 *
 * Generic transaction lifecycle machine that routes to different transport actors
 * based on transaction type:
 * - EOA: Standard wallet transactions via submitEOATransaction
 * - Rhinestone: Smart account transactions via submitRhinestoneTransaction
 * - ERC-4337: User operations (not yet implemented)
 *
 * This machine focuses solely on transaction lifecycle (submit → pending → confirm).
 * Account initialization and management is handled externally by AccountProvider.
 */
export const transactionMachine: ActorLogic<any, any, any, any, any> = setup({
  types: {
    context: {} as {
      publicClient: PublicClient
      walletClient?: WalletClient
      rhinestoneConfig?: RhinestoneConfig
      rhinestoneAccount?: any
      request?: TransactionRequest
      options: TransactionOptions
      hash?: Hash
      userOpHash?: Hash
      receipt?: TransactionReceipt
      error?: Error
      retryCount: number
      fallbackChecks: number
      modal: TransactionModalState
    },
    input: {} as {
      publicClient?: PublicClient
      walletClient?: WalletClient
      rhinestoneConfig?: RhinestoneConfig
      rhinestoneAccount?: any
      request?: TransactionRequest
      options?: TransactionOptions
    },
    events: {} as
      | { type: 'EXECUTE'; request: TransactionRequest; options?: TransactionOptions; modal?: Partial<TransactionModalState> }
      | { type: 'RETRY' }
      | { type: 'CANCEL' }
      | { type: 'FORCE_SUCCESS' }
      | { type: 'OPEN_MODAL'; data?: Partial<TransactionModalState> }
      | { type: 'CLOSE_MODAL' }
      | { type: 'UPDATE_MODAL_DATA'; data: Partial<TransactionModalState> },
  },
  actors: {
    /**
     * Submit Transaction Actor
     *
     * Routes to the appropriate transport actor based on request.type:
     * - eoa → submitEOATransaction
     * - rhinestone-intent → submitRhinestoneTransaction
     * - erc4337 → (not yet implemented)
     */
    submitTransaction: fromResultAsync(
      ({
        request,
        options,
        publicClient,
        walletClient,
        rhinestoneConfig,
        rhinestoneAccount,
      }: {
        request?: TransactionRequest
        options?: TransactionOptions
        publicClient: PublicClient
        walletClient?: WalletClient
        rhinestoneConfig?: RhinestoneConfig
        rhinestoneAccount?: any
      }): ResultAsync<Hash, TransactionSubmissionError> => {
        console.log('🔧 [TRANSACTION] submitTransaction actor invoked:', {
          requestType: request?.type,
          hasWalletClient: !!walletClient,
          hasRhinestoneAccount: !!rhinestoneAccount,
        })

        if (!request) {
          return errAsync(
            new TransactionSubmissionError(
              {} as TransactionRequest,
              new Error('No transaction request provided')
            )
          )
        }

        // Route to transport actor based on type
        switch (request.type) {
          case 'eoa':
            if (!walletClient) {
              return errAsync(
                new TransactionSubmissionError(
                  request,
                  new Error('Wallet client required for EOA transactions')
                )
              )
            }
            return submitEOATransaction({ request: request as EOATransactionRequest, walletClient })

          case 'rhinestone-intent':
            if (!rhinestoneAccount) {
              return errAsync(
                new TransactionSubmissionError(
                  request,
                  new Error('Rhinestone account required for Rhinestone transactions')
                )
              )
            }
            if (!rhinestoneConfig) {
              return errAsync(
                new TransactionSubmissionError(
                  request,
                  new Error('Rhinestone config required for Rhinestone transactions')
                )
              )
            }
            return submitRhinestoneTransaction({
              request,
              rhinestoneAccount,
              publicClient,
              rhinestoneConfig,
            })

          case 'erc4337':
            return errAsync(
              new TransactionSubmissionError(
                request,
                new Error('ERC-4337 transactions not yet implemented')
              )
            )

          default:
            return errAsync(
              new TransactionSubmissionError(request, new Error(`Unknown transaction type: ${(request as any).type}`))
            )
        }
      }
    ),

    /**
     * Wait for Transaction Receipt
     */
    waitForReceipt: fromResultAsync(
      ({
        hash,
        options,
        publicClient,
      }: {
        hash: Hash
        options?: TransactionOptions
        publicClient: PublicClient
      }): ResultAsync<TransactionReceipt, TransactionTimeoutError> => {
        const confirmations = options?.confirmations || 1
        const timeout = options?.timeout || 60000

        console.log('⏳ [TRANSACTION] Waiting for receipt:', {
          hash,
          confirmations,
          timeout,
        })

        return fromPromiseNT(
          publicClient.waitForTransactionReceipt({
            hash,
            confirmations,
            timeout,
          }),
          (error) => new TransactionTimeoutError(hash, timeout)
        )
      }
    ),

    /**
     * Check transaction with eth_call fallback
     */
    checkWithEthCall: fromResultAsync(
      ({
        request,
        publicClient,
      }: {
        request?: TransactionRequest
        publicClient: PublicClient
      }): ResultAsync<{ wouldSucceed: boolean; result?: Hash }, EthCallFallbackError> => {
        if (!request) {
          return errAsync(new EthCallFallbackError({} as TransactionRequest, new Error('No request provided')))
        }

        if (request.type === 'erc4337' || request.type === 'rhinestone-intent') {
          // For 4337 and Rhinestone, we'd need different simulation methods
          return ResultAsync.fromSafePromise(Promise.resolve({ wouldSucceed: true }))
        }

        const eoaRequest = request as EOATransactionRequest

        return fromPromiseNT(
          publicClient
            .call({
              account: eoaRequest.from,
              to: eoaRequest.to,
              data: eoaRequest.data,
              value: eoaRequest.value,
              gas: eoaRequest.gas,
            })
            .then((result) => ({
              wouldSucceed: !result.data?.includes('0x08c379a0'), // Check for revert
              result: result.data,
            })),
          (error) => new EthCallFallbackError(request, error)
        )
      }
    ),

    /**
     * Wait utility actor
     */
    wait: fromPromise(({ input }: { input: number }) => new Promise((resolve) => setTimeout(resolve, input))),
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < (context.options.retryCount || 3),

    shouldCheckFallback: ({ context }) => context.fallbackChecks < 3,

    wouldSucceed: (_, params: any) => params.wouldSucceed === true,

    isReverted: ({ context }) => context.receipt?.status === 'reverted',
  },
  actions: {
    recordTransition: ({ context, self, event }) => {
      try {
        const state = self.getSnapshot()
        auditTrail.recordTransition({
          machineId: 'transaction',
          fromState: state.status === 'active' ? String(state.value) : 'unknown',
          toState: String(state.value),
          event: event?.type || 'unknown',
          context: {
            hash: context.hash,
            request: context.request,
            retryCount: context.retryCount,
          },
          metadata: {
            chainId: context.request?.chainId,
            transactionHash: context.hash,
          },
        })
      } catch (auditError) {
        console.warn('Audit service error (non-fatal):', auditError)
      }
    },

    logError: ({ context }, params: any) => {
      const error = params?.error || params || 'Unknown error'
      try {
        auditTrail.addAuditEntry('error', 'Transaction error occurred', {
          error,
          hash: context.hash,
          request: context.request,
        })
      } catch (auditError) {
        console.warn('Audit service error (non-fatal):', auditError)
      }
      console.error('❌ [TRANSACTION] Error:', error)
    },

    logCritical: ({ context }, params: any) => {
      const error = params?.error || params || 'Unknown critical error'
      try {
        auditTrail.addAuditEntry('critical', 'Critical transaction failure', {
          error,
          hash: context.hash,
          request: context.request,
          retryCount: context.retryCount,
        })
      } catch (auditError) {
        console.warn('Audit service error (non-fatal):', auditError)
      }
      console.error('🔥 [TRANSACTION] CRITICAL:', error)
    },
  },
}).createMachine({
  id: 'transaction',
  initial: 'idle',
  context: ({ input }) => {
    console.log('🏗️ [TRANSACTION] Initializing context:', {
      hasRequest: !!input.request,
      requestType: input.request?.type,
      hasPublicClient: !!(input.publicClient || input.options?.publicClient),
      hasWalletClient: !!(input.walletClient || input.options?.walletClient),
      hasRhinestoneAccount: !!input.rhinestoneAccount,
    })

    return {
      publicClient: input.publicClient || input.options?.publicClient!,
      walletClient: input.walletClient || input.options?.walletClient,
      rhinestoneConfig: input.rhinestoneConfig || input.options?.rhinestoneConfig,
      rhinestoneAccount: input.rhinestoneAccount,
      request: input.request,
      options: input.options || {},
      retryCount: 0,
      fallbackChecks: 0,
      modal: {
        isOpen: false,
        flowType: 'single',
        currentStepIndex: 0,
        ...(input.options?.modal || {}),
      },
    }
  },
  on: {
    CLOSE_MODAL: {
      actions: assign({
        modal: ({ context }) => ({
          ...context.modal,
          isOpen: false,
        }),
      }),
    },
    UPDATE_MODAL_DATA: {
      actions: assign({
        modal: ({ event, context }) => ({
          ...context.modal,
          ...event.data,
        }),
      }),
    },
  },
  states: {
    idle: {
      entry: ({ context }) => {
        console.log('🔵 [TRANSACTION] Entered idle state:', {
          hasRequest: !!context.request,
          requestType: context.request?.type,
        })
      },
      always: {
        guard: ({ context }) => !!context.request && !!context.publicClient,
        target: 'submitting',
      },
      on: {
        EXECUTE: {
          target: 'submitting',
          actions: assign({
            request: ({ event }) => event.request,
            options: ({ event }) => event.options || {},
            retryCount: 0,
            fallbackChecks: 0,
            hash: undefined,
            userOpHash: undefined,
            receipt: undefined,
            error: undefined,
            modal: ({ event, context }) => ({
              ...context.modal,
              ...(event.modal || {}),
              isOpen: true,
            }),
          }),
        },
        OPEN_MODAL: {
          actions: assign({
            modal: ({ event, context }) => ({
              ...context.modal,
              ...(event.data || {}),
              isOpen: true,
            }),
          }),
        },
      },
    },

    submitting: {
      entry: [
        'recordTransition',
        ({ context }) => {
          console.log('📤 [TRANSACTION] Submitting transaction:', {
            requestType: context.request?.type,
            hasWalletClient: !!context.walletClient,
            hasRhinestoneAccount: !!context.rhinestoneAccount,
          })
        },
      ],
      invoke: {
        src: 'submitTransaction',
        input: ({ context }) => ({
          request: context.request,
          options: context.options,
          publicClient: context.publicClient,
          walletClient: context.walletClient,
          rhinestoneConfig: context.rhinestoneConfig,
          rhinestoneAccount: context.rhinestoneAccount,
        }),
        onDone: {
          target: 'pending',
          actions: [
            assign({
              hash: ({ event }) => event.output,
              userOpHash: ({ event, context }) =>
                context.request?.type === 'erc4337' ? event.output : undefined,
            }),
            'recordTransition',
            ({ event }) => {
              console.log('✅ [TRANSACTION] Transaction submitted:', {
                hash: event.output,
              })
            },
          ],
        },
        onError: [
          {
            guard: 'canRetry',
            target: 'retrying',
            actions: [
              assign({
                error: ({ event }) => event.error as Error,
                retryCount: ({ context }) => context.retryCount + 1,
              }),
              'logError',
              'recordTransition',
            ],
          },
          {
            target: 'error.submission',
            actions: [
              assign({
                error: ({ event }) => event.error as Error,
              }),
              'logCritical',
              'recordTransition',
            ],
          },
        ],
      },
    },

    pending: {
      entry: [
        'recordTransition',
        ({ context }) => {
          console.log('⏳ [TRANSACTION] Transaction pending:', {
            hash: context.hash,
          })
        },
      ],
      invoke: {
        src: 'waitForReceipt',
        input: ({ context }) => ({
          hash: context.hash!,
          options: context.options,
          publicClient: context.publicClient,
        }),
        onDone: {
          target: 'confirming',
          actions: [
            assign({
              receipt: ({ event }) => event.output,
            }),
            'recordTransition',
          ],
        },
        onError: [
          {
            guard: 'shouldCheckFallback',
            target: 'checkingFallback',
            actions: [
              assign({
                fallbackChecks: ({ context }) => context.fallbackChecks + 1,
              }),
              'recordTransition',
            ],
          },
          {
            target: 'error.timeout',
            actions: [
              assign({
                error: ({ event }) => event.error as Error,
              }),
              'logError',
              'recordTransition',
            ],
          },
        ],
      },
      on: {
        FORCE_SUCCESS: {
          target: 'success',
          actions: 'recordTransition',
        },
      },
    },

    checkingFallback: {
      entry: [
        'recordTransition',
        () => {
          console.log('🔍 [TRANSACTION] Checking with eth_call fallback')
        },
      ],
      invoke: {
        src: 'checkWithEthCall',
        input: ({ context }) => ({
          request: context.request,
          publicClient: context.publicClient,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.wouldSucceed,
            target: 'success',
            actions: [
              ({ context }) => {
                try {
                  auditTrail.addAuditEntry('warning', 'Transaction succeeded via eth_call fallback', {
                    hash: context.hash,
                    request: context.request,
                  })
                } catch (auditError) {
                  console.warn('Audit service error (non-fatal):', auditError)
                }
              },
              'recordTransition',
            ],
          },
          {
            target: 'pending',
            actions: 'recordTransition',
          },
        ],
        onError: {
          target: 'pending',
          actions: 'recordTransition',
        },
      },
    },

    confirming: {
      entry: [
        'recordTransition',
        ({ context }) => {
          console.log('✔️ [TRANSACTION] Confirming transaction:', {
            hash: context.hash,
            status: context.receipt?.status,
          })
        },
      ],
      always: [
        {
          guard: 'isReverted',
          target: 'error.reverted',
          actions: [
            assign({
              error: ({ context }) =>
                new TransactionRevertedError(`Transaction ${context.hash} reverted`),
            }),
            'logError',
            'recordTransition',
          ],
        },
        {
          target: 'success',
          actions: 'recordTransition',
        },
      ],
    },

    retrying: {
      entry: [
        'recordTransition',
        ({ context }) => {
          console.log('🔄 [TRANSACTION] Retrying transaction (attempt ${context.retryCount})')
        },
      ],
      invoke: {
        src: 'wait',
        input: ({ context }) => context.options.retryDelay || 2000,
        onDone: {
          target: 'submitting',
          actions: 'recordTransition',
        },
      },
      on: {
        CANCEL: {
          target: 'error.cancelled',
          actions: 'recordTransition',
        },
      },
    },

    success: {
      entry: [
        'recordTransition',
        ({ context }) => {
          try {
            auditTrail.addAuditEntry('info', 'Transaction completed successfully', {
              hash: context.hash,
              receipt: context.receipt,
              gasUsed: context.receipt?.gasUsed?.toString(),
            })
          } catch (auditError) {
            console.warn('Audit service error (non-fatal):', auditError)
          }
          console.log('✅ [TRANSACTION] Transaction successful:', {
            hash: context.hash,
          })
        },
      ],
      on: {
        EXECUTE: {
          target: 'submitting',
          actions: assign({
            request: ({ event }) => event.request,
            options: ({ event }) => event.options || {},
            retryCount: 0,
            fallbackChecks: 0,
            hash: undefined,
            userOpHash: undefined,
            receipt: undefined,
            error: undefined,
          }),
        },
      },
    },

    error: {
      initial: 'unknown',
      states: {
        validation: {
          entry: 'recordTransition',
        },
        submission: {
          entry: 'recordTransition',
        },
        timeout: {
          entry: 'recordTransition',
        },
        reverted: {
          entry: 'recordTransition',
        },
        cancelled: {
          entry: 'recordTransition',
        },
        unknown: {
          entry: 'recordTransition',
        },
      },
      on: {
        RETRY: {
          target: 'submitting',
          actions: [
            assign({
              retryCount: ({ context }) => context.retryCount + 1,
              error: undefined,
            }),
            'recordTransition',
          ],
        },
        EXECUTE: {
          target: 'submitting',
          actions: assign({
            request: ({ event }) => event.request,
            options: ({ event }) => event.options || {},
            retryCount: 0,
            fallbackChecks: 0,
            hash: undefined,
            userOpHash: undefined,
            receipt: undefined,
            error: undefined,
          }),
        },
      },
    },
  },
})
