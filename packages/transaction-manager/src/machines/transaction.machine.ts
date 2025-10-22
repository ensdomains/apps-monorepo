import { setup, assign, fromPromise, type ActorLogic } from 'xstate'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import { ResultAsync, errAsync, fromPromise as fromPromiseNT } from 'neverthrow'
import type { Hash, TransactionReceipt, PublicClient, WalletClient } from 'viem'
import type { TransactionRequest, TransactionOptions, TransactionModalState, RhinestoneConfig, EOATransactionRequest } from '../types/transaction.types'
import { initializeRhinestoneAccount, executeENSRenewal } from '../helpers/rhinestone-account.helpers'
import { prepareENSRenewal } from '../helpers/ens-renewal.helpers'
import * as auditTrail from '../services/audit-trail.service'
import {
  TransactionSubmissionError,
  TransactionTimeoutError,
  TransactionRevertedError,
  GasEstimationError,
  UserOperationError,
  EthCallFallbackError
} from '../errors/transaction.errors'

export const transactionMachine: ActorLogic<any, any, any, any, any> = setup({
  types: {
    context: {} as {
      publicClient: PublicClient
      walletClient?: WalletClient
      rhinestoneConfig?: RhinestoneConfig
      rhinestoneAccount?: any // Cached Rhinestone account instance
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
      publicClient: PublicClient
      walletClient?: WalletClient
      rhinestoneConfig?: RhinestoneConfig
    },
    events: {} as
      | { type: 'EXECUTE'; request: TransactionRequest; options?: TransactionOptions; modal?: Partial<TransactionModalState> }
      | { type: 'PREPARE_AND_EXECUTE'; name: string; duration: string; useSmartAccount: boolean; renewalPrice?: bigint }
      | { type: 'RETRY' }
      | { type: 'CANCEL' }
      | { type: 'FORCE_SUCCESS' }
      | { type: 'OPEN_MODAL'; data?: Partial<TransactionModalState> }
      | { type: 'CLOSE_MODAL' }
      | { type: 'UPDATE_MODAL_DATA'; data: Partial<TransactionModalState> }
  },
  actors: {
    prepareRenewal: fromResultAsync(
      ({ name, duration, useSmartAccount, renewalPrice, publicClient, walletClient, chainId, rhinestoneConfig }: {
        name: string
        duration: string
        useSmartAccount: boolean
        renewalPrice?: bigint
        publicClient: PublicClient
        walletClient?: WalletClient
        chainId: number
        rhinestoneConfig?: RhinestoneConfig
      }): ResultAsync<{ request: TransactionRequest; options: TransactionOptions; modal: Partial<TransactionModalState> }, Error> => {
        if (!walletClient) {
          return errAsync(new Error('Wallet client required'))
        }

        const YEAR_IN_SECONDS = 31536000n
        const cleanName = name.replace('.eth', '')
        const durationInSeconds = BigInt(duration) * YEAR_IN_SECONDS

        // Call prepareENSRenewal helper
        return ResultAsync.fromSafePromise(
          prepareENSRenewal({
            publicClient,
            walletClient,
            name: cleanName,
            duration: durationInSeconds,
            chainId,
            useSmartAccount,
            rhinestoneConfig: useSmartAccount ? rhinestoneConfig : undefined,
          })
        )
          .andThen(result => result) // Unwrap the Result from the Promise
          .map((data: any) => ({
            request: data.request,
            options: {
              ...data.options,
              description: `Renew ${cleanName}.eth for ${duration} year(s)`,
            },
            modal: {
              title: `Renew ${name}`,
              ensName: name,
              network: 'Sepolia',
              estimatedCost: renewalPrice ? `${renewalPrice.toString()} wei` : '0.0011 ETH',
            },
          }))
          .mapErr(error => error as Error)
      }
    ),

    initializeRhinestoneAccount: fromResultAsync(
      ({ walletClient, rhinestoneConfig }: {
        walletClient?: WalletClient
        rhinestoneConfig?: RhinestoneConfig
      }): ResultAsync<any, Error> => {
        if (!rhinestoneConfig) {
          return errAsync(new Error('Rhinestone config required'))
        }

        if (!walletClient) {
          return errAsync(new Error('Wallet client required'))
        }

        // initializeRhinestoneAccount returns Promise<Result>, so wrap it with ResultAsync.fromSafePromise
        return ResultAsync.fromSafePromise(initializeRhinestoneAccount(walletClient, rhinestoneConfig))
          .andThen(result => result) // Unwrap the Result from the Promise
          .mapErr(error => error as Error)
      }
    ),

    submitTransaction: fromResultAsync(
      ({ request, options, publicClient, walletClient, rhinestoneConfig, rhinestoneAccount }: {
        request?: TransactionRequest
        options?: TransactionOptions
        publicClient: PublicClient
        walletClient?: WalletClient
        rhinestoneConfig?: RhinestoneConfig
        rhinestoneAccount?: any
      }): ResultAsync<Hash, TransactionSubmissionError | UserOperationError> => {
        console.log('🔧 [ACTOR] submitTransaction actor invoked with:', {
          requestType: request?.type,
          hasRhinestoneAccount: !!rhinestoneAccount,
          rhinestoneAccountAddress: rhinestoneAccount?.getAddress?.(),
          rhinestoneAccountType: typeof rhinestoneAccount
        })

        if (!request) {
          throw new Error('No transaction request provided')
        }

        // Handle Rhinestone intent transactions
        if (request.type === 'rhinestone-intent') {
          console.log('🔧 [ACTOR] Handling rhinestone-intent transaction')

          if (!rhinestoneConfig) {
            return errAsync(new TransactionSubmissionError(
              request,
              new Error('Rhinestone config required for rhinestone-intent transactions')
            ))
          }
          if (!request.rhinestoneParams) {
            return errAsync(new TransactionSubmissionError(
              request,
              new Error('rhinestoneParams required for Rhinestone transactions')
            ))
          }

          if (!rhinestoneAccount) {
            return errAsync(new TransactionSubmissionError(
              request,
              new Error('Rhinestone account must be initialized before executing transactions')
            ))
          }

          console.log('🔧 [ACTOR] Executing with cached Rhinestone account:', {
            hasAccount: !!rhinestoneAccount,
            accountAddress: rhinestoneAccount?.getAddress?.()
          })

          // executeENSRenewal returns Promise<Result>, so wrap it with ResultAsync.fromSafePromise
          return ResultAsync.fromSafePromise(
            executeENSRenewal(rhinestoneAccount, publicClient, request.rhinestoneParams, rhinestoneConfig)
          )
            .andThen(result => result) // Unwrap the Result from the Promise
            .mapErr(error => {
              console.error('❌ Rhinestone error:', error)
              return new TransactionSubmissionError(request, error as Error)
            })
        }

        // Handle EOA transactions
        if (request.type === 'eoa') {
          if (!walletClient) {
            return errAsync(new TransactionSubmissionError(
              request,
              new Error('Wallet client required for EOA transactions')
            ))
          }

          const eoaRequest = request as EOATransactionRequest

          // Build transaction params - either legacy (gasPrice) or EIP-1559 (maxFeePerGas)
          const txParams: any = {
            account: eoaRequest.from,
            to: eoaRequest.to,
            value: eoaRequest.value,
            data: eoaRequest.data,
            gas: eoaRequest.gas,
            nonce: eoaRequest.nonce,
            chain: walletClient.chain
          }

          // Use either legacy or EIP-1559 gas pricing (not both)
          if (eoaRequest.maxFeePerGas !== undefined) {
            txParams.maxFeePerGas = eoaRequest.maxFeePerGas
            txParams.maxPriorityFeePerGas = eoaRequest.maxPriorityFeePerGas
          } else if (eoaRequest.gasPrice !== undefined) {
            txParams.gasPrice = eoaRequest.gasPrice
          }

          return fromPromiseNT(
            walletClient.sendTransaction(txParams),
            (error) => new TransactionSubmissionError(request, error)
          )
        }

        // ERC-4337 not fully implemented
        return errAsync(new TransactionSubmissionError(
          request,
          new Error('ERC-4337 transactions not yet implemented')
        ))
      }
    ),

    waitForReceipt: fromResultAsync(
      ({ hash, options, publicClient }: {
        hash: Hash
        options?: TransactionOptions
        publicClient: PublicClient
      }): ResultAsync<TransactionReceipt, TransactionTimeoutError> => {
        const confirmations = options?.confirmations || 1
        const timeout = options?.timeout || 60000

        return fromPromiseNT(
          publicClient.waitForTransactionReceipt({
            hash,
            confirmations,
            timeout
          }),
          (error) => new TransactionTimeoutError(hash, timeout)
        )
      }
    ),

    checkWithEthCall: fromResultAsync(
      ({ request, publicClient }: {
        request?: TransactionRequest
        publicClient: PublicClient
      }): ResultAsync<{ wouldSucceed: boolean; result?: Hash }, EthCallFallbackError> => {
        if (!request) {
          throw new Error('No transaction request provided')
        }

        if (request.type === 'erc4337') {
          // For 4337, we'd simulate the user operation
          return ResultAsync.fromSafePromise(Promise.resolve({ wouldSucceed: true }))
        }

        const eoaRequest = request as EOATransactionRequest

        return fromPromiseNT(
          publicClient.call({
            account: eoaRequest.from,
            to: eoaRequest.to,
            data: eoaRequest.data,
            value: eoaRequest.value,
            gas: eoaRequest.gas
          }).then(result => ({
            wouldSucceed: !result.data?.includes('0x08c379a0'), // Check for revert
            result: result.data
          })),
          (error) => new EthCallFallbackError(request, error)
        )
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
    publicClient: input.publicClient,
    walletClient: input.walletClient,
    rhinestoneConfig: input.rhinestoneConfig,
    request: undefined,
    options: {},
    retryCount: 0,
    fallbackChecks: 0,
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
        PREPARE_AND_EXECUTE: {
          target: 'preparingTransaction',
          actions: assign({
            retryCount: 0,
            fallbackChecks: 0,
            hash: undefined,
            userOpHash: undefined,
            receipt: undefined,
            error: undefined,
            modal: ({ context }) => ({
              ...context.modal,
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

    preparingTransaction: {
      entry: ['recordTransition'],
      invoke: {
        src: 'prepareRenewal',
        input: ({ context, event }) => {
          const prepareEvent = event as { type: 'PREPARE_AND_EXECUTE'; name: string; duration: string; useSmartAccount: boolean; renewalPrice?: bigint }
          return {
            name: prepareEvent.name,
            duration: prepareEvent.duration,
            useSmartAccount: prepareEvent.useSmartAccount,
            renewalPrice: prepareEvent.renewalPrice,
            publicClient: context.publicClient,
            walletClient: context.walletClient,
            chainId: context.publicClient.chain?.id || 11155111, // Default to Sepolia
            rhinestoneConfig: context.rhinestoneConfig,
          }
        },
        onDone: {
          target: 'preparing',
          actions: [
            assign({
              request: ({ event }) => event.output.request,
              options: ({ event }) => event.output.options || {},
              modal: ({ event, context }) => ({
                ...context.modal,
                ...event.output.modal,
                isOpen: true
              })
            }),
            'recordTransition'
          ]
        },
        onError: {
          target: 'error.validation',
          actions: [
            assign({
              error: ({ event }) => event.error as Error
            }),
            'logError',
            'recordTransition'
          ]
        }
      }
    },

    preparing: {
      entry: [
        'recordTransition',
        ({ context }) => {
          const isRhinestoneIntent = context.request?.type === 'rhinestone-intent'
          const hasAccount = !!context.rhinestoneAccount
          const hasConfig = !!context.rhinestoneConfig
          const willInitialize = isRhinestoneIntent && !hasAccount && hasConfig

          console.log('🔧 [STATE MACHINE] Entering preparing state', {
            requestType: context.request?.type,
            isRhinestoneIntent,
            hasRhinestoneAccount: hasAccount,
            rhinestoneAccountAddress: context.rhinestoneAccount?.getAddress?.(),
            hasRhinestoneConfig: hasConfig,
            willInitializeAccount: willInitialize,
            nextState: willInitialize ? 'initializingSmartAccount' : 'submitting'
          })
        }
      ],
      always: [
        {
          // Initialize smart account first if using Rhinestone and account not cached
          guard: ({ context }) =>
            context.request?.type === 'rhinestone-intent' &&
            !context.rhinestoneAccount &&
            !!context.rhinestoneConfig,
          target: 'initializingSmartAccount'
        },
        {
          target: 'submitting'
        }
      ]
    },

    initializingSmartAccount: {
      entry: [
        'recordTransition',
        ({ context }) => {
          console.log('🔧 [STATE MACHINE] Entering initializingSmartAccount state', {
            hasExistingAccount: !!context.rhinestoneAccount,
            existingAccountAddress: context.rhinestoneAccount?.getAddress?.()
          })
        }
      ],
      invoke: {
        src: 'initializeRhinestoneAccount',
        input: ({ context }) => {
          const inputData = {
            walletClient: context.walletClient,
            rhinestoneConfig: context.rhinestoneConfig,
          }
          console.log('🔧 [STATE MACHINE] Input to initializeRhinestoneAccount:', {
            hasWalletClient: !!inputData.walletClient,
            hasConfig: !!inputData.rhinestoneConfig
          })
          return inputData
        },
        onDone: {
          target: 'submitting',
          actions: [
            ({ event }) => {
              console.log('🔧 [STATE MACHINE] initializeRhinestoneAccount onDone - received account:', {
                hasAccount: !!event.output,
                accountAddress: event.output?.getAddress?.(),
                accountType: typeof event.output
              })
            },
            assign({
              rhinestoneAccount: ({ event }) => {
                const account = event.output
                console.log('🔧 [STATE MACHINE] Assigning rhinestoneAccount to context:', {
                  hasAccount: !!account,
                  accountAddress: account?.getAddress?.()
                })
                return account
              }
            }),
            ({ context }) => {
              console.log('🔧 [STATE MACHINE] After assignment - context.rhinestoneAccount:', {
                hasAccount: !!context.rhinestoneAccount,
                accountAddress: context.rhinestoneAccount?.getAddress?.()
              })
            },
            'recordTransition'
          ]
        },
        onError: {
          target: 'error.submission',
          actions: [
            ({ event }) => {
              console.error('🔧 [STATE MACHINE] initializeRhinestoneAccount onError:', event.error)
            },
            assign({
              error: ({ event }) => event.error as Error
            }),
            'logCritical',
            'recordTransition'
          ]
        }
      }
    },

    submitting: {
      entry: [
        'recordTransition',
        ({ context }) => {
          console.log('🔧 [STATE MACHINE] Entering submitting state', {
            requestType: context.request?.type,
            hasRhinestoneAccount: !!context.rhinestoneAccount,
            rhinestoneAccountAddress: context.rhinestoneAccount?.getAddress?.()
          })
        }
      ],
      invoke: {
        src: 'submitTransaction',
        input: ({ context }) => {
          const inputData = {
            request: context.request,
            options: context.options,
            publicClient: context.publicClient,
            walletClient: context.walletClient,
            rhinestoneConfig: context.rhinestoneConfig,
            rhinestoneAccount: context.rhinestoneAccount
          }
          console.log('🔧 [STATE MACHINE] Input to submitTransaction:', {
            requestType: inputData.request?.type,
            hasRhinestoneAccount: !!inputData.rhinestoneAccount,
            rhinestoneAccountAddress: inputData.rhinestoneAccount?.getAddress?.()
          })
          return inputData
        },
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
          publicClient: context.publicClient,
          walletClient: context.walletClient,
          rhinestoneConfig: context.rhinestoneConfig
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
          publicClient: context.publicClient,
          walletClient: context.walletClient,
          rhinestoneConfig: context.rhinestoneConfig
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
        validation: {
          entry: 'recordTransition'
        },
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