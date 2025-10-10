import { setup, assign, fromPromise } from 'xstate'
import type { Hash, TransactionReceipt } from 'viem'
import type { TransactionRequest, TransactionOptions } from '../types/transaction.types'
import type { TransactionService } from '../services/transaction.service'
import type { AuditTrailService } from '../services/audit-trail.service'
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
      request: TransactionRequest
      options: TransactionOptions
      hash?: Hash
      userOpHash?: Hash
      receipt?: TransactionReceipt
      error?: Error
      retryCount: number
      fallbackChecks: number
      transactionService: TransactionService
      auditService?: AuditTrailService
    },
    input: {} as {
      request: TransactionRequest
      options?: TransactionOptions
      transactionService: TransactionService
      auditService?: AuditTrailService
    },
    events: {} as
      | { type: 'RETRY' }
      | { type: 'CANCEL' }
      | { type: 'FORCE_SUCCESS' }
  },
  actors: {
    submitTransaction: fromPromise(async ({ input }: {
      input: {
        request: TransactionRequest
        options?: TransactionOptions
        service: TransactionService
      }
    }) => {
      const result = await input.service.submitTransaction(
        input.request,
        input.options
      )

      if (result.isErr()) {
        throw result.error
      }

      return result.value
    }),

    waitForReceipt: fromPromise(async ({ input }: {
      input: {
        hash: Hash
        options?: TransactionOptions
        service: TransactionService
      }
    }) => {
      const result = await input.service.waitForReceipt(
        input.hash,
        {
          confirmations: input.options?.confirmations,
          timeout: input.options?.timeout
        }
      )

      if (result.isErr()) {
        throw result.error
      }

      return result.value
    }),

    checkWithEthCall: fromPromise(async ({ input }: {
      input: {
        request: TransactionRequest
        service: TransactionService
      }
    }) => {
      const result = await input.service.checkWithEthCall(input.request)

      if (result.isErr()) {
        throw result.error
      }

      return result.value
    }),

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
    recordTransition: ({ context, self }) => {
      if (context.auditService) {
        const state = self.getSnapshot()
        context.auditService.recordTransition({
          machineId: 'transaction',
          fromState: state.status === 'active' ? String(state.value) : 'unknown',
          toState: String(state.value),
          event: state.event?.type || 'unknown',
          context: {
            hash: context.hash,
            request: context.request,
            retryCount: context.retryCount
          },
          metadata: {
            chainId: context.request.chainId,
            transactionHash: context.hash
          }
        })
      }
    },

    logError: ({ context }, params: any) => {
      const error = params?.error || params || 'Unknown error'
      if (context.auditService) {
        context.auditService.addAuditEntry(
          'error',
          'Transaction error occurred',
          {
            error,
            hash: context.hash,
            request: context.request
          }
        )
      }
      console.error('Transaction error:', error)
    },

    logCritical: ({ context }, params: any) => {
      const error = params?.error || params || 'Unknown critical error'
      if (context.auditService) {
        context.auditService.addAuditEntry(
          'critical',
          'Critical transaction failure',
          {
            error,
            hash: context.hash,
            request: context.request,
            retryCount: context.retryCount
          }
        )
      }
      console.error('CRITICAL:', error)
    }
  }
}).createMachine({
  id: 'transaction',
  initial: 'preparing',
  context: ({ input }) => ({
    request: input.request,
    options: input.options || {},
    retryCount: 0,
    fallbackChecks: 0,
    transactionService: input.transactionService,
    auditService: input.auditService
  }),
  states: {
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
                context.request.type === 'erc4337' ? event.output : undefined
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
                if (context.auditService) {
                  context.auditService.addAuditEntry(
                    'warning',
                    'Transaction succeeded via eth_call fallback',
                    {
                      hash: context.hash,
                      request: context.request
                    }
                  )
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
              error: ({ context }) => new TransactionRevertedError({
                hash: context.hash!,
                reason: 'Transaction reverted'
              })
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
      type: 'final',
      entry: [
        'recordTransition',
        ({ context }) => {
          if (context.auditService) {
            context.auditService.addAuditEntry(
              'info',
              'Transaction completed successfully',
              {
                hash: context.hash,
                receipt: context.receipt,
                gasUsed: context.receipt?.gasUsed?.toString()
              }
            )
          }
        }
      ]
    },

    error: {
      initial: 'unknown',
      states: {
        submission: {
          type: 'final',
          entry: 'recordTransition'
        },
        timeout: {
          type: 'final',
          entry: 'recordTransition'
        },
        reverted: {
          type: 'final',
          entry: 'recordTransition'
        },
        cancelled: {
          type: 'final',
          entry: 'recordTransition'
        },
        unknown: {
          type: 'final',
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
        }
      }
    }
  }
})