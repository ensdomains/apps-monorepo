import type { V1Domain } from '@ens-apps/migration'
import type { Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, Hex, PublicClient } from 'viem'
import {
  assign,
  fromCallback,
  fromPromise,
  type SnapshotFrom,
  setup,
} from 'xstate'
import {
  adjustPlanForRetry,
  type MigrationPlan,
} from '@/features/migration/service/buildMigrationPlan'
import type { MigrationWalletRequestDescriptor } from '@/features/migration/service/buildStepDescriptors'
import {
  decodeMigrationError,
  type MigrationError,
} from '@/features/migration/service/decodeMigrationError'
import type { MigrationJournalOperation } from '@/features/migration/service/migrationBatchJournal'
import {
  executeMigration,
  type MigrationProgress,
  type MigrationResult,
} from '@/features/migration/service/migrationService'
import { publicClient as defaultPublicClient } from '@/lib/wagmi'
import {
  executeGraceRenewal,
  type GraceRenewalQuote,
  type GraceRenewalStatus,
} from '../service/graceRenewal'
import type { PendingGraceRenewal } from '../service/graceRenewalPending'
import { prepareGraceRenewalMigration } from '../service/prepareGraceRenewalMigration'
import {
  FINAL_STAGE_FILL_MS,
  REUNION_HOLD_MS,
  REUNION_SLIDE_MS,
} from './migrationAnimationTiming'

const FAILURE_HOLD_MS = 1500

type RenewalPreparation = {
  readonly quote: GraceRenewalQuote
  readonly domains: readonly V1Domain[]
  readonly hcaAddress: Address
  readonly requestSteps?: readonly MigrationWalletRequestDescriptor[]
}

const renewalStepsOf = (steps: readonly MigrationWalletRequestDescriptor[]) =>
  steps.filter(
    ({ type }) => type === 'renewal-approval' || type === 'renew-grace',
  )

const withRenewalApproval = (
  steps: readonly MigrationWalletRequestDescriptor[],
  required: boolean,
): readonly MigrationWalletRequestDescriptor[] => {
  const withoutApproval = steps.filter(
    ({ type }) => type !== 'renewal-approval',
  )
  return required
    ? [{ type: 'renewal-approval' }, ...withoutApproval]
    : withoutApproval
}

const renewalProgress = (
  steps: readonly MigrationWalletRequestDescriptor[],
  currentStep: number,
  isAwaitingConfirmation = false,
): MigrationProgress => ({
  currentStep,
  // Keep room for migration while its executable plan is prepared after renewal.
  totalSteps: Math.max(steps.length, renewalStepsOf(steps).length + 1),
  description: '',
  isAwaitingConfirmation,
})

type Context = {
  wagmiConfig: WagmiConfig
  selectedNames: string[]
  /**
   * Names whose ENSv1 registry controller the owner chose to keep as a manager.
   * Empty by default: nothing is re-granted unless it is asked for by name.
   */
  managerRestorationNames: string[]
  plan?: MigrationPlan
  signer?: Signer
  hcaClient?: Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
  refreshAccount?: () => Promise<void>
  reconcileBeforeSubmit: boolean
  completedOperations: MigrationJournalOperation[]
  txHashes: readonly Hex[]
  progress?: MigrationProgress
  stepDescriptors: readonly MigrationWalletRequestDescriptor[]
  lastError?: MigrationError
  renewal?: RenewalPreparation
  renewalHash?: Hex
  renewedDomains?: readonly V1Domain[]
  renewalApprovalCompleted: boolean
  renewalDiscardConfirmation?: {
    readonly pending: PendingGraceRenewal
    readonly resolve: (confirmed: boolean) => void
  }
}

type Events =
  | { type: 'selection.set'; names: string[] }
  | { type: 'managerRestoration.set'; names: string[] }
  | {
      type: 'migration.renewAndStart'
      renewal: RenewalPreparation
      signer: Signer
      hcaClient: Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
      refreshAccount: () => Promise<void>
    }
  | {
      type: 'renewal.discardConfirmation'
      confirmation: NonNullable<Context['renewalDiscardConfirmation']>
    }
  | { type: 'renewal.submitted'; hash: Hex }
  | { type: 'renewal.approvalRequired'; required: boolean }
  | { type: 'renewal.status'; status: GraceRenewalStatus }
  | { type: 'renewal.complete'; domains: readonly V1Domain[] }
  | {
      type: 'migration.start'
      plan: MigrationPlan
      signer: Signer
      hcaClient: Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
      refreshAccount: () => Promise<void>
    }
  | { type: 'migration.progress'; progress: MigrationProgress }
  | {
      type: 'migration.batchComplete'
      operations: readonly MigrationJournalOperation[]
      txHash?: Hex
    }
  | {
      type: 'migration.complete'
      result: MigrationResult
    }
  | { type: 'migration.failed'; error: MigrationError }
  | { type: 'retry' }
  | { type: 'done' }
  | { type: 'cancel' }

const initialContext = (wagmiConfig: WagmiConfig): Context => ({
  wagmiConfig,
  selectedNames: [],
  managerRestorationNames: [],
  plan: undefined,
  reconcileBeforeSubmit: false,
  completedOperations: [],
  txHashes: [],
  progress: undefined,
  stepDescriptors: [],
  lastError: undefined,
  renewal: undefined,
  renewalHash: undefined,
  renewedDomains: undefined,
  renewalApprovalCompleted: false,
})

export const migrationUiMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Events,
    input: {} as { wagmiConfig: WagmiConfig },
    tags: '' as 'running' | 'result',
  },
  delays: {
    failureHold: FAILURE_HOLD_MS,
    finalFill: FINAL_STAGE_FILL_MS,
    reunionHold: REUNION_SLIDE_MS + REUNION_HOLD_MS,
  },
  actors: {
    renewGraceNames: fromCallback<
      Events,
      {
        renewal: RenewalPreparation
        signer: Signer
        renewalHash?: Hex
      }
    >(({ input, sendBack }) => {
      const controller = new AbortController()
      if (input.signer.type !== 'eoa') {
        sendBack({
          type: 'migration.failed',
          error: {
            type: 'generic',
            message: 'Connect your wallet to renew these names.',
          },
        })
        return
      }
      void executeGraceRenewal({
        quote: input.renewal.quote,
        walletClient: input.signer.walletClient,
        publicClient: defaultPublicClient as PublicClient,
        renewalHash: input.renewalHash,
        signal: controller.signal,
        confirmDiscardUnsubmittedRenewal: (pending) =>
          new Promise<boolean>((resolve) => {
            controller.signal.addEventListener('abort', () => resolve(false), {
              once: true,
            })
            sendBack({
              type: 'renewal.discardConfirmation',
              confirmation: { pending, resolve },
            })
          }),
        onRenewalSubmitted: (hash) =>
          sendBack({ type: 'renewal.submitted', hash }),
        onApprovalRequired: (required) =>
          sendBack({ type: 'renewal.approvalRequired', required }),
        onStatus: (status) => sendBack({ type: 'renewal.status', status }),
      }).then((result) => {
        if (controller.signal.aborted) return
        if (result.isErr()) {
          sendBack({
            type: 'migration.failed',
            error: decodeMigrationError(result.error),
          })
        } else {
          sendBack({ type: 'renewal.complete', domains: result.value })
        }
      })
      return () => controller.abort()
    }),
    prepareRenewedMigration: fromPromise<
      MigrationPlan,
      {
        renewal: RenewalPreparation
        renewedDomains: readonly V1Domain[]
        managerRestorationNames: readonly string[]
        wagmiConfig: WagmiConfig
      }
    >(({ input, signal }) =>
      prepareGraceRenewalMigration({
        domains: input.renewal.domains,
        renewedDomains: input.renewedDomains,
        ownerAddress: input.renewal.quote.ownerAddress,
        hcaAddress: input.renewal.hcaAddress,
        publicClient: defaultPublicClient as PublicClient,
        wagmiConfig: input.wagmiConfig,
        managerRestorationNames: input.managerRestorationNames,
        signal,
      }),
    ),
    runMigration: fromCallback<
      Events,
      {
        wagmiConfig: WagmiConfig
        plan: MigrationPlan
        signer: Signer
        hcaClient: Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
        refreshAccount: () => Promise<void>
        reconcileBeforeSubmit: boolean
        renewalStepCount: number
      }
    >(({ input, sendBack }) => {
      let cancelled = false

      const onProgress = (progress: MigrationProgress) => {
        if (cancelled) return
        sendBack({
          type: 'migration.progress',
          progress: {
            ...progress,
            currentStep: progress.currentStep + input.renewalStepCount,
            totalSteps: progress.totalSteps + input.renewalStepCount,
          },
        })
      }

      const onBatchComplete = (
        operations: readonly MigrationJournalOperation[],
        txHash?: Hex,
      ) => {
        if (cancelled) return
        sendBack({ type: 'migration.batchComplete', operations, txHash })
      }

      executeMigration({
        plan: input.plan,
        wagmiConfig: input.wagmiConfig,
        publicClient: defaultPublicClient as PublicClient,
        signer: input.signer,
        hcaClient: input.hcaClient,
        refreshAccount: input.refreshAccount,
        onProgress,
        onBatchComplete,
        reconcileBeforeSubmit: input.reconcileBeforeSubmit,
      })
        .then((result) => {
          if (cancelled) return
          sendBack({ type: 'migration.complete', result })
        })
        .catch((err: unknown) => {
          if (cancelled) return
          sendBack({
            type: 'migration.failed',
            error: decodeMigrationError(err),
          })
        })

      return () => {
        cancelled = true
      }
    }),
  },
  guards: {
    hasSelection: ({ event }) =>
      event.type === 'migration.start' && event.plan.classified.length > 0,
    isOnlyFailures: ({ event, context }) =>
      event.type === 'migration.complete' &&
      event.result.txHashes.length === 0 &&
      event.result.completedOperations.length === 0 &&
      context.completedOperations.length === 0,
  },
  actions: {
    captureRenewalStart: assign(({ event }) => {
      if (event.type !== 'migration.renewAndStart') return {}
      const stepDescriptors = event.renewal.requestSteps ?? [
        {
          type: 'renew-grace' as const,
          count: event.renewal.quote.items.filter(
            ({ duration }) => duration > 0n,
          ).length,
        },
      ]
      return {
        renewal: event.renewal,
        signer: event.signer,
        hcaClient: event.hcaClient,
        refreshAccount: event.refreshAccount,
        selectedNames: event.renewal.domains.map(({ name }) => name),
        plan: undefined,
        renewalHash: undefined,
        renewedDomains: undefined,
        renewalApprovalCompleted: false,
        lastError: undefined,
        progress: renewalProgress(stepDescriptors, 0),
        stepDescriptors,
      }
    }),
    setSelection: assign({
      selectedNames: ({ event, context }) =>
        event.type === 'selection.set' ? event.names : context.selectedNames,
    }),
    setManagerRestoration: assign({
      managerRestorationNames: ({ event, context }) =>
        event.type === 'managerRestoration.set'
          ? event.names
          : context.managerRestorationNames,
    }),
    captureMigrationStart: assign(({ event }) => {
      if (event.type !== 'migration.start') return {}
      return {
        plan: event.plan,
        signer: event.signer,
        hcaClient: event.hcaClient,
        refreshAccount: event.refreshAccount,
        reconcileBeforeSubmit: event.plan.requiresReconciliation ?? false,
        stepDescriptors: event.plan.stepDescriptors,
        progress: undefined,
        lastError: undefined,
        txHashes: [] as readonly Hex[],
        renewal: undefined,
        renewalHash: undefined,
        renewedDomains: undefined,
        renewalApprovalCompleted: false,
      }
    }),
    setRenewalApprovalRequired: assign(({ context, event }) => {
      if (event.type !== 'renewal.approvalRequired') return {}
      const stepDescriptors = withRenewalApproval(
        context.stepDescriptors,
        event.required || context.renewalApprovalCompleted,
      )
      return {
        stepDescriptors,
        progress: renewalProgress(
          stepDescriptors,
          context.renewalApprovalCompleted ? 1 : 0,
        ),
      }
    }),
    setRenewalStatus: assign(({ context, event }) => {
      if (event.type !== 'renewal.status') return {}
      const isApproving =
        event.status === 'approving' || event.status === 'approval-confirming'
      const stepDescriptors =
        isApproving || event.status === 'approval-complete'
          ? withRenewalApproval(context.stepDescriptors, true)
          : context.stepDescriptors
      const hasApproval = stepDescriptors.some(
        ({ type }) => type === 'renewal-approval',
      )
      return {
        stepDescriptors,
        renewalApprovalCompleted:
          context.renewalApprovalCompleted || (!isApproving && hasApproval),
        progress: renewalProgress(
          stepDescriptors,
          isApproving ? 0 : hasApproval ? 1 : 0,
          event.status === 'approval-confirming' ||
            event.status === 'confirming',
        ),
      }
    }),
    setProgress: assign({
      progress: ({ event, context }) =>
        event.type === 'migration.progress' ? event.progress : context.progress,
    }),
    appendBatchComplete: assign(({ event, context }) => {
      if (event.type !== 'migration.batchComplete') return {}
      const existing = new Map(
        context.completedOperations.map((operation) => [
          operation.name,
          operation,
        ]),
      )
      const nextOperations = [...context.completedOperations]
      for (const operation of event.operations) {
        const previous = existing.get(operation.name)
        if (previous && previous.action !== operation.action) {
          throw new Error(
            `Migration action changed for ${operation.name}: ${previous.action} -> ${operation.action}`,
          )
        }
        if (!previous) {
          nextOperations.push(operation)
          existing.set(operation.name, operation)
        }
      }
      const nextHashes = event.txHash
        ? new Set(context.txHashes).has(event.txHash)
          ? context.txHashes
          : [...context.txHashes, event.txHash]
        : context.txHashes
      return {
        completedOperations: nextOperations,
        txHashes: nextHashes,
      }
    }),
    recordCompletion: assign(({ event, context }) => {
      if (event.type !== 'migration.complete') return {}
      const existingHashes = new Set(context.txHashes)
      const mergedHashes = [
        ...context.txHashes,
        ...event.result.txHashes.filter((h) => !existingHashes.has(h)),
      ]
      const existingOperations = new Map(
        context.completedOperations.map((operation) => [
          operation.name,
          operation,
        ]),
      )
      const completedOperations = [...context.completedOperations]
      for (const operation of event.result.completedOperations) {
        const previous = existingOperations.get(operation.name)
        if (previous && previous.action !== operation.action) {
          throw new Error(
            `Migration action changed for ${operation.name}: ${previous.action} -> ${operation.action}`,
          )
        }
        if (!previous) {
          completedOperations.push(operation)
          existingOperations.set(operation.name, operation)
        }
      }
      return {
        completedOperations,
        txHashes: mergedHashes,
      }
    }),
    setError: assign({
      lastError: ({ event, context }) =>
        event.type === 'migration.failed' ? event.error : context.lastError,
    }),
    resetForRetry: assign(({ context }) => {
      if (!context.plan) return {}
      const completedNames = context.completedOperations.map(({ name }) => name)
      const nextPlan = adjustPlanForRetry(context.plan, completedNames)
      const completedSet = new Set(completedNames)
      const renewalSteps = context.renewedDomains
        ? renewalStepsOf(context.stepDescriptors)
        : []
      return {
        plan: nextPlan,
        stepDescriptors: [...renewalSteps, ...nextPlan.stepDescriptors],
        selectedNames: context.selectedNames.filter(
          (name) => !completedSet.has(name),
        ),
        managerRestorationNames: context.managerRestorationNames.filter(
          (name) => !completedSet.has(name),
        ),
        reconcileBeforeSubmit: true,
        lastError: undefined,
        progress: context.renewedDomains
          ? {
              currentStep: renewalSteps.length,
              totalSteps: nextPlan.stepDescriptors.length + renewalSteps.length,
              description: '',
            }
          : undefined,
      }
    }),
    resetAll: assign(({ context }) => ({
      ...initialContext(context.wagmiConfig),
    })),
  },
}).createMachine({
  id: 'migrationUi',
  context: ({ input }) => initialContext(input.wagmiConfig),
  initial: 'select',
  on: {
    'migration.failed': {
      target: '.failure',
      actions: 'setError',
    },
  },
  states: {
    select: {
      on: {
        'selection.set': {
          actions: 'setSelection',
        },
        'managerRestoration.set': {
          actions: 'setManagerRestoration',
        },
        'migration.start': {
          target: 'migrate',
          guard: 'hasSelection',
          actions: 'captureMigrationStart',
        },
        'migration.renewAndStart': {
          target: 'migrate.renewing',
          guard: ({ event }) =>
            event.renewal.quote.items.length > 0 &&
            event.renewal.domains.length > 0 &&
            event.renewal.quote.balance >= event.renewal.quote.totalAmount,
          actions: 'captureRenewalStart',
        },
      },
    },
    migrate: {
      initial: 'running',
      states: {
        renewing: {
          tags: 'running',
          exit: assign({ renewalDiscardConfirmation: undefined }),
          invoke: {
            src: 'renewGraceNames',
            input: ({ context }) => {
              if (!context.renewal || !context.signer)
                throw new Error('Renewal context is incomplete')
              return {
                renewal: context.renewal,
                signer: context.signer,
                renewalHash: context.renewalHash,
              }
            },
          },
          on: {
            'renewal.discardConfirmation': {
              actions: assign({
                renewalDiscardConfirmation: ({ event }) => event.confirmation,
              }),
            },
            'migration.progress': { actions: 'setProgress' },
            'renewal.approvalRequired': {
              actions: 'setRenewalApprovalRequired',
            },
            'renewal.status': { actions: 'setRenewalStatus' },
            'renewal.submitted': {
              actions: assign({ renewalHash: ({ event }) => event.hash }),
            },
            'renewal.complete': {
              target: 'preparing',
              actions: assign({
                renewedDomains: ({ event }) => event.domains,
                progress: ({ context }) =>
                  renewalProgress(
                    context.stepDescriptors,
                    renewalStepsOf(context.stepDescriptors).length,
                  ),
              }),
            },
            'migration.failed': { target: 'failing', actions: 'setError' },
          },
        },
        preparing: {
          tags: 'running',
          invoke: {
            src: 'prepareRenewedMigration',
            input: ({ context }) => {
              if (!context.renewal || !context.renewedDomains)
                throw new Error('Renewed names are required')
              return {
                renewal: context.renewal,
                renewedDomains: context.renewedDomains,
                managerRestorationNames: context.managerRestorationNames,
                wagmiConfig: context.wagmiConfig,
              }
            },
            onDone: {
              target: 'running',
              actions: assign(({ context, event }) => {
                const renewalSteps = renewalStepsOf(context.stepDescriptors)
                return {
                  plan: event.output,
                  stepDescriptors: [
                    ...renewalSteps,
                    ...event.output.stepDescriptors,
                  ],
                  progress: {
                    currentStep: renewalSteps.length,
                    totalSteps:
                      event.output.stepDescriptors.length + renewalSteps.length,
                    description: '',
                  },
                }
              }),
            },
            onError: {
              target: 'failing',
              actions: assign({
                lastError: ({ event }) => decodeMigrationError(event.error),
              }),
            },
          },
        },
        running: {
          tags: 'running',
          invoke: {
            id: 'runMigration',
            src: 'runMigration',
            input: ({ context }) => {
              if (
                !context.plan ||
                !context.signer ||
                !context.hcaClient ||
                !context.refreshAccount
              ) {
                throw new Error('Migration context is incomplete')
              }
              return {
                wagmiConfig: context.wagmiConfig,
                plan: context.plan,
                signer: context.signer,
                hcaClient: context.hcaClient,
                refreshAccount: context.refreshAccount,
                reconcileBeforeSubmit: context.reconcileBeforeSubmit,
                renewalStepCount: context.renewedDomains
                  ? renewalStepsOf(context.stepDescriptors).length
                  : 0,
              }
            },
          },
          on: {
            'migration.progress': {
              actions: 'setProgress',
            },
            'migration.batchComplete': {
              actions: 'appendBatchComplete',
            },
            'migration.complete': [
              {
                target: 'failing',
                guard: 'isOnlyFailures',
              },
              {
                target: 'landing',
                actions: 'recordCompletion',
              },
            ],
            'migration.failed': {
              target: 'failing',
              actions: 'setError',
            },
          },
        },
        landing: {
          tags: 'running',
          after: { finalFill: { target: 'reuniting' } },
        },
        reuniting: {
          tags: 'running',
          after: { reunionHold: { target: '#migrationUi.success' } },
        },
        failing: {
          tags: 'running',
          after: {
            failureHold: { target: '#migrationUi.failure' },
          },
        },
      },
    },
    success: {
      tags: 'result',
      on: {
        done: {
          target: 'select',
          actions: 'resetAll',
        },
      },
    },
    failure: {
      tags: 'result',
      on: {
        retry: [
          {
            guard: ({ context }) => !!context.plan,
            target: 'migrate.running',
            actions: 'resetForRetry',
          },
          {
            guard: ({ context }) => !!context.renewedDomains,
            target: 'migrate.preparing',
            actions: assign({ lastError: undefined }),
          },
          {
            guard: ({ context }) => !!context.renewal,
            target: 'migrate.renewing',
            actions: assign({ lastError: undefined }),
          },
        ],
        cancel: {
          target: 'select',
          actions: 'resetAll',
        },
      },
    },
  },
})

export type MigrationUiSnapshot = SnapshotFrom<typeof migrationUiMachine>
