import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import { errAsync, fromPromise, ResultAsync } from 'neverthrow'
import type { Hash, PublicClient, TransactionReceipt } from 'viem'
import { assign, fromPromise as fromPromiseXState, setup } from 'xstate'
import { submitEOATransaction } from '../actors/eoa-transport.actor'
import { prepareTransaction } from '../actors/prepare-transaction.actor'
import { submitRhinestoneTransaction } from '../actors/rhinestone-transport.actor'
import {
  EthCallFallbackError,
  TransactionRevertedError,
  TransactionSubmissionError,
  TransactionTimeoutError,
} from '../errors/transaction.errors'
import * as auditTrail from '../services/audit-trail.service'
import type { Signer } from '../types/signer.types'
import type {
  EOATransactionRequest,
  TransactionIntent,
  TransactionModalState,
  TransactionOptions,
  TransactionRequest,
} from '../types/transaction.types'

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
export const transactionMachine = setup({
  types: {
    context: {} as {
      publicClient: PublicClient
      signer?: Signer
      intent?: TransactionIntent
      request?: TransactionRequest
      options: TransactionOptions
      chainId?: number
      useSmartAccount: boolean
      estimatedCost?: bigint
      hash?: Hash
      userOpHash?: Hash
      receipt?: TransactionReceipt
      error?: Error
      retryCount: number
      fallbackChecks: number
      modal: TransactionModalState
    },
    input: {} as {
      publicClient: PublicClient
      signer?: Signer
      intent?: TransactionIntent
      request?: TransactionRequest
      options?: TransactionOptions
      chainId?: number
      useSmartAccount?: boolean
    },
    events: {} as
      | {
          type: 'EXECUTE'
          request: TransactionRequest
          options?: TransactionOptions
          modal?: Partial<TransactionModalState>
        }
      | { type: 'RETRY' }
      | { type: 'CANCEL' }
      | { type: 'FORCE_SUCCESS' }
      | { type: 'OPEN_MODAL'; data?: Partial<TransactionModalState> }
      | { type: 'CLOSE_MODAL' }
      | { type: 'UPDATE_MODAL_DATA'; data: Partial<TransactionModalState> },
  },
  actors: {
    /**
     * Prepare Transaction Actor
     *
     * Routes to the appropriate preparation logic based on intent.type:
     * - ens-renewal → prepareENSRenewal
     * - eth-transfer → prepareETHTransfer
     * - custom → use provided request
     */
    prepareTransaction: fromResultAsync(
      ({
        intent,
        publicClient,
        chainId,
        useSmartAccount,
      }: {
        intent: TransactionIntent
        publicClient: PublicClient
        chainId: number
        useSmartAccount: boolean
      }) => {
        console.log('🔧 [TRANSACTION] prepareTransaction actor invoked:', {
          intentType: intent.type,
          useSmartAccount,
          chainId,
        })

        return prepareTransaction({
          intent,
          publicClient,
          chainId,
          useSmartAccount,
        })
      },
    ),

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
        signer,
        publicClient,
      }: {
        request?: TransactionRequest
        signer?: Signer
        publicClient: PublicClient
      }): ResultAsync<Hash, TransactionSubmissionError> => {
        console.log('🔧 [TRANSACTION] submitTransaction actor invoked:', {
          requestType: request?.type,
          signerType: signer?.type,
        })

        if (!request) {
          return errAsync(
            new TransactionSubmissionError(
              {} as TransactionRequest,
              new Error('No transaction request provided'),
            ),
          )
        }

        if (!signer) {
          return errAsync(
            new TransactionSubmissionError(
              request,
              new Error('No signer provided'),
            ),
          )
        }

        // Route to transport actor based on signer type
        switch (signer.type) {
          case 'eoa':
            return submitEOATransaction({ request, signer })

          case 'rhinestone':
            return submitRhinestoneTransaction({
              request,
              signer,
              publicClient,
            })

          case 'erc4337':
            return errAsync(
              new TransactionSubmissionError(
                request,
                new Error('ERC-4337 transactions not yet implemented'),
              ),
            )

          default:
            return errAsync(
              new TransactionSubmissionError(
                request,
                new Error(
                  `Unknown signer type: ${(signer as { type?: string }).type || 'unknown'}`,
                ),
              ),
            )
        }
      },
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
        const timeout = options?.timeout || 3000

        console.log('⏳ [TRANSACTION] Waiting for receipt:', {
          hash,
          confirmations,
          timeout,
        })

        return fromPromise(
          publicClient.waitForTransactionReceipt({
            hash,
            confirmations,
            timeout,
          }),
          (_error) => new TransactionTimeoutError(hash, timeout),
        )
      },
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
      }): ResultAsync<
        { wouldSucceed: boolean; result?: Hash },
        EthCallFallbackError
      > => {
        if (!request) {
          return errAsync(
            new EthCallFallbackError(
              {} as TransactionRequest,
              new Error('No request provided'),
            ),
          )
        }

        if (
          request.type === 'erc4337' ||
          request.type === 'rhinestone-intent'
        ) {
          // For 4337 and Rhinestone, we'd need different simulation methods
          return ResultAsync.fromSafePromise(
            Promise.resolve({ wouldSucceed: true }),
          )
        }

        const eoaRequest = request as EOATransactionRequest

        return fromPromise(
          (async () => {
            const result = await publicClient.call({
              account: eoaRequest.from,
              to: eoaRequest.to,
              data: eoaRequest.data,
              value: eoaRequest.value,
              gas: eoaRequest.gas,
            })
            return {
              wouldSucceed: !result.data?.includes('0x08c379a0'), // Check for revert
              result: result.data,
            }
          })(),
          (error) => new EthCallFallbackError(request, error),
        )
      },
    ),

    /**
     * Wait utility actor
     */
    wait: fromPromiseXState(
      ({ input }: { input: number }) =>
        new Promise((resolve) => setTimeout(resolve, input)),
    ),
  },
  guards: {
    canRetry: ({ context }) =>
      context.retryCount < (context.options.retryCount || 3),

    shouldCheckFallback: ({ context }) => context.fallbackChecks < 3,

    wouldSucceed: (_, params: { wouldSucceed?: boolean }) =>
      params.wouldSucceed === true,

    isReverted: ({ context }) => context.receipt?.status === 'reverted',
  },
  actions: {
    recordTransition: ({ context, self, event }) => {
      try {
        const state = self.getSnapshot()
        auditTrail.recordTransition({
          machineId: 'transaction',
          fromState:
            state.status === 'active' ? String(state.value) : 'unknown',
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

    logError: (
      { context },
      params: { error?: Error | string } | Error | string,
    ) => {
      const error =
        params && typeof params === 'object' && 'error' in params
          ? params.error
          : params || 'Unknown error'
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
      hasIntent: !!input.intent,
      intentType: input.intent?.type,
      hasRequest: !!input.request,
      requestType: input.request?.type,
      hasPublicClient: !!input.publicClient,
      signerType: input.signer?.type,
      chainId: input.chainId,
      useSmartAccount: input.useSmartAccount,
    })

    // Extract request from custom intent if applicable
    const request =
      input.request ||
      (input.intent?.type === 'custom' ? input.intent.request : undefined)

    return {
      publicClient: input.publicClient!,
      signer: input.signer,
      intent: input.intent,
      request,
      options: input.options || {},
      chainId: input.chainId,
      useSmartAccount: input.useSmartAccount || false,
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
          hasIntent: !!context.intent,
          intentType: context.intent?.type,
          hasRequest: !!context.request,
          requestType: context.request?.type,
        })
      },
      always: [
        {
          // If we have an intent, prepare the transaction first
          guard: ({ context }) =>
            !!context.intent && !!context.publicClient && !!context.chainId,
          target: 'preparing',
        },
        {
          // If we have a pre-prepared request, skip to submitting
          guard: ({ context }) => !!context.request && !!context.publicClient,
          target: 'submitting',
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

    preparing: {
      entry: [
        'recordTransition',
        ({ context }) => {
          console.log('🔧 [TRANSACTION] Preparing transaction:', {
            intentType: context.intent?.type,
            chainId: context.chainId,
            useSmartAccount: context.useSmartAccount,
          })
        },
      ],
      invoke: {
        src: 'prepareTransaction',
        input: ({ context }) => ({
          intent: context.intent!,
          publicClient: context.publicClient,
          chainId: context.chainId!,
          useSmartAccount: context.useSmartAccount,
        }),
        onDone: {
          target: 'submitting',
          actions: [
            assign({
              request: ({ event }) => event.output.request,
              estimatedCost: ({ event }) => event.output.estimatedCost,
            }),
            'recordTransition',
            ({ event }) => {
              console.log('✅ [TRANSACTION] Transaction prepared:', {
                requestType: event.output.request.type,
                estimatedCost: event.output.estimatedCost.toString(),
              })
            },
          ],
        },
        onError: {
          target: 'error.preparation',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
            }),
            'logCritical',
            'recordTransition',
          ],
        },
      },
      on: {
        CANCEL: 'error.cancelled',
      },
    },

    submitting: {
      entry: [
        'recordTransition',
        ({ context }) => {
          console.log('📤 [TRANSACTION] Submitting transaction:', {
            requestType: context.request?.type,
            signerType: context.signer?.type,
          })
        },
      ],
      invoke: {
        src: 'submitTransaction',
        input: ({ context }) => ({
          request: context.request,
          signer: context.signer,
          publicClient: context.publicClient,
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
                  auditTrail.addAuditEntry(
                    'warning',
                    'Transaction succeeded via eth_call fallback',
                    {
                      hash: context.hash,
                      request: context.request,
                    },
                  )
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
                new TransactionRevertedError(
                  `Transaction ${context.hash} reverted`,
                ),
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
          console.log(
            '🔄 [TRANSACTION] Retrying transaction (attempt ${context.retryCount})',
          )
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
            auditTrail.addAuditEntry(
              'info',
              'Transaction completed successfully',
              {
                hash: context.hash,
                receipt: context.receipt,
                gasUsed: context.receipt?.gasUsed?.toString(),
              },
            )
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
        preparation: {
          entry: 'recordTransition',
        },
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
