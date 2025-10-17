import { setup, assign, fromPromise } from 'xstate'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Hash, TransactionReceipt } from 'viem'
import type { TransactionRequest, TransactionOptions, TransactionModalState } from '../types/transaction.types'
import type { TransactionService } from '../services/transaction.service'
import * as auditTrail from '../services/audit-trail.service'
import {
  TransactionSubmissionError,
  TransactionTimeoutError,
  TransactionRevertedError,
  GasEstimationError,
  UserOperationError
} from '../errors/transaction.errors'

export const transactionMachine = setup({
  types: {
    context: {} as {
      request?: TransactionRequest
      options: TransactionOptions
      hash?: Hash
      userOpHash?: Hash
      receipt?: TransactionReceipt
      error?: Error
      retryCount: number
      fallbackChecks: number
      transactionService: TransactionService
      modal: TransactionModalState
    },
    input: {} as {
      transactionService: TransactionService
    },
    events: {} as
      | { type: 'EXECUTE'; request: TransactionRequest; options?: TransactionOptions; modal?: Partial<TransactionModalState> }
      | { type: 'RETRY' }
      | { type: 'CANCEL' }
      | { type: 'FORCE_SUCCESS' }
      | { type: 'OPEN_MODAL'; data?: Partial<TransactionModalState> }
      | { type: 'CLOSE_MODAL' }
      | { type: 'UPDATE_MODAL_DATA'; data: Partial<TransactionModalState> }
  },
  actors: {
    submitTransaction: fromResultAsync(
      ({ request, options, service }: {
        request?: TransactionRequest
        options?: TransactionOptions
        service: TransactionService
      }) => {
        if (!request) {
          throw new Error('No transaction request provided')
        }

        return service.submitTransaction(request, options)
      }
    ),

    waitForReceipt: fromResultAsync(
      ({ hash, options, service }: {
        hash: Hash
        options?: TransactionOptions
        service: TransactionService
      }) => {
        return service.waitForReceipt(hash, {
          confirmations: options?.confirmations,
          timeout: options?.timeout
        })
      }
    ),

    checkWithEthCall: fromResultAsync(
      ({ request, service }: {
        request?: TransactionRequest
        service: TransactionService
      }) => {
        if (!request) {
          throw new Error('No transaction request provided')
        }

        return service.checkWithEthCall(request)
      }
    ),

    wait: fromPromise(({ input }: { input: number }) =>
      new Promise(resolve => setTimeout(resolve, input))
    )
  },
  guards: {
    canRetry: ({ context }) =>
      context.retryCount < (context.options.retryCount || 3),

    shouldCheckFallback: ({ context }) =>
      context.fallbackChecks < 3,

    wouldSucceed: (_, params: any) =>
      params.wouldSucceed === true,

    isReverted: ({ context }) =>
      context.receipt?.status === 'reverted'
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
            retryCount: context.retryCount
          },
          metadata: {
            chainId: context.request?.chainId,
            transactionHash: context.hash
          }
        })
      } catch (auditError) {
        // Audit service errors should never crash the app
        console.warn('Audit service error (non-fatal):', auditError)
      }
    },

    logError: ({ context }, params: any) => {
      const error = params?.error || params || 'Unknown error'
      try {
        auditTrail.addAuditEntry(
          'error',
          'Transaction error occurred',
          {
            error,
            hash: context.hash,
            request: context.request
          }
        )
      } catch (auditError) {
        // Audit service errors should never crash the app
        console.warn('Audit service error (non-fatal):', auditError)
      }
      console.error('Transaction error:', error)
    },

    logCritical: ({ context }, params: any) => {
      const error = params?.error || params || 'Unknown critical error'
      try {
        auditTrail.addAuditEntry(
          'critical',
          'Critical transaction failure',
          {
            error,
            hash: context.hash,
            request: context.request,
            retryCount: context.retryCount
          }
        )
      } catch (auditError) {
        // Audit service errors should never crash the app
        console.warn('Audit service error (non-fatal):', auditError)
      }
      console.error('CRITICAL:', error)
    }
  }
}).createMachine({
  id: 'transaction',
  initial: 'idle',
  context: ({ input }) => ({
    request: undefined,
    options: {},
    retryCount: 0,
    fallbackChecks: 0,
    transactionService: input.transactionService,
    modal: {
      isOpen: false,
      flowType: 'single',
      currentStepIndex: 0
    }
  }),
  on: {
    CLOSE_MODAL: {
      actions: assign({
        modal: ({ context }) => ({
          ...context.modal,
          isOpen: false
        })
      })
    },
    UPDATE_MODAL_DATA: {
      actions: assign({
        modal: ({ event, context }) => ({
          ...context.modal,
          ...event.data
        })
      })
    }
  },
  states: {
    idle: {
      on: {
        EXECUTE: {
          target: 'preparing',
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
              isOpen: true
            })
          })
        },
        OPEN_MODAL: {
          actions: assign({
            modal: ({ event, context }) => ({
              ...context.modal,
              ...(event.data || {}),
              isOpen: true
            })
          })
        }
      }
    },

    preparing: {
      entry: 'recordTransition',
      always: 'submitting'
    },

    submitting: {
      entry: 'recordTransition',
      invoke: {
        src: 'submitTransaction',
        input: ({ context }) => ({
          request: context.request,
          options: context.options,
          service: context.transactionService
        }),
        onDone: {
          target: 'pending',
          actions: [
            assign({
              hash: ({ event }) => event.output,
              userOpHash: ({ event, context }) =>
                context.request?.type === 'erc4337' ? event.output : undefined
            }),
            'recordTransition'
          ]
        },
        onError: [
          {
            guard: 'canRetry',
            target: 'retrying',
            actions: [
              assign({
                error: ({ event }) => event.error as Error,
                retryCount: ({ context }) => context.retryCount + 1
              }),
              'logError',
              'recordTransition'
            ]
          },
          {
            target: 'error.submission',
            actions: [
              assign({
                error: ({ event }) => event.error as Error
              }),
              'logCritical',
              'recordTransition'
            ]
          }
        ]
      }
    },

    pending: {
      entry: 'recordTransition',
      invoke: {
        src: 'waitForReceipt',
        input: ({ context }) => ({
          hash: context.hash!,
          options: context.options,
          service: context.transactionService
        }),
        onDone: [
          {
            target: 'confirming',
            actions: [
              assign({
                receipt: ({ event }) => event.output
              }),
              'recordTransition'
            ]
          }
        ],
        onError: [
          {
            guard: 'shouldCheckFallback',
            target: 'checkingFallback',
            actions: [
              assign({
                fallbackChecks: ({ context }) => context.fallbackChecks + 1
              }),
              'recordTransition'
            ]
          },
          {
            target: 'error.timeout',
            actions: [
              assign({
                error: ({ event }) => event.error as Error
              }),
              'logError',
              'recordTransition'
            ]
          }
        ]
      },
      on: {
        FORCE_SUCCESS: {
          target: 'success',
          actions: 'recordTransition'
        }
      }
    },

    checkingFallback: {
      entry: 'recordTransition',
      invoke: {
        src: 'checkWithEthCall',
        input: ({ context }) => ({
          request: context.request,
          service: context.transactionService
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
                      request: context.request
                    }
                  )
                } catch (auditError) {
                  console.warn('Audit service error (non-fatal):', auditError)
                }
              },
              'recordTransition'
            ]
          },
          {
            target: 'pending',
            actions: 'recordTransition'
          }
        ],
        onError: {
          target: 'pending',
          actions: 'recordTransition'
        }
      }
    },

    confirming: {
      entry: 'recordTransition',
      always: [
        {
          guard: 'isReverted',
          target: 'error.reverted',
          actions: [
            assign({
              error: ({ context }) => new TransactionRevertedError(
                `Transaction ${context.hash} reverted`
              )
            }),
            'logError',
            'recordTransition'
          ]
        },
        {
          target: 'success',
          actions: 'recordTransition'
        }
      ]
    },

    retrying: {
      entry: 'recordTransition',
      invoke: {
        src: 'wait',
        input: ({ context }) => context.options.retryDelay || 2000,
        onDone: {
          target: 'submitting',
          actions: 'recordTransition'
        }
      },
      on: {
        CANCEL: {
          target: 'error.cancelled',
          actions: 'recordTransition'
        }
      }
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
                gasUsed: context.receipt?.gasUsed?.toString()
              }
            )
          } catch (auditError) {
            console.warn('Audit service error (non-fatal):', auditError)
          }
        }
      ],
      on: {
        EXECUTE: {
          target: 'preparing',
          actions: assign({
            request: ({ event }) => event.request,
            options: ({ event }) => event.options || {},
            retryCount: 0,
            fallbackChecks: 0,
            hash: undefined,
            userOpHash: undefined,
            receipt: undefined,
            error: undefined
          })
        }
      }
    },

    error: {
      initial: 'unknown',
      states: {
        submission: {
          entry: 'recordTransition'
        },
        timeout: {
          entry: 'recordTransition'
        },
        reverted: {
          entry: 'recordTransition'
        },
        cancelled: {
          entry: 'recordTransition'
        },
        unknown: {
          entry: 'recordTransition'
        }
      },
      on: {
        RETRY: {
          target: 'submitting',
          actions: [
            assign({
              retryCount: ({ context }) => context.retryCount + 1,
              error: undefined
            }),
            'recordTransition'
          ]
        },
        EXECUTE: {
          target: 'preparing',
          actions: assign({
            request: ({ event }) => event.request,
            options: ({ event }) => event.options || {},
            retryCount: 0,
            fallbackChecks: 0,
            hash: undefined,
            userOpHash: undefined,
            receipt: undefined,
            error: undefined
          })
        }
      }
    }
  }
})