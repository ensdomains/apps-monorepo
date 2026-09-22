import type { Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { Hex, PublicClient } from 'viem'
import { assign, fromCallback, type SnapshotFrom, setup } from 'xstate'
import {
  adjustPlanForRetry,
  type MigrationPlan,
} from '@/features/migration/service/buildMigrationPlan'
import {
  decodeMigrationError,
  type MigrationError,
} from '@/features/migration/service/decodeMigrationError'
import type { MigrationJournalOperation } from '@/features/migration/service/migrationBatchJournal'
import {
  executeMigration,
  type MigrationProgress,
  type MigrationResult,
  type MigrationStepDescriptor,
} from '@/features/migration/service/migrationService'
import { publicClient as defaultPublicClient } from '@/lib/wagmi'
import {
  FINAL_STAGE_FILL_MS,
  REUNION_HOLD_MS,
  REUNION_SLIDE_MS,
} from './migrationAnimationTiming'

const FAILURE_HOLD_MS = 1500

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
  stepDescriptors: readonly MigrationStepDescriptor[]
  lastError?: MigrationError
}

type Events =
  | { type: 'selection.set'; names: string[] }
  | { type: 'managerRestoration.set'; names: string[] }
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
    runMigration: fromCallback<
      Events,
      {
        wagmiConfig: WagmiConfig
        plan: MigrationPlan
        signer: Signer
        hcaClient: Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
        refreshAccount: () => Promise<void>
        reconcileBeforeSubmit: boolean
      }
    >(({ input, sendBack }) => {
      let cancelled = false

      const onProgress = (progress: MigrationProgress) => {
        if (cancelled) return
        sendBack({ type: 'migration.progress', progress })
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
      return {
        plan: nextPlan,
        stepDescriptors: nextPlan.stepDescriptors,
        selectedNames: context.selectedNames.filter(
          (name) => !completedSet.has(name),
        ),
        managerRestorationNames: context.managerRestorationNames.filter(
          (name) => !completedSet.has(name),
        ),
        reconcileBeforeSubmit: true,
        lastError: undefined,
        progress: undefined,
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
      },
    },
    migrate: {
      initial: 'running',
      states: {
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
        retry: {
          target: 'migrate',
          actions: 'resetForRetry',
        },
        cancel: {
          target: 'select',
          actions: 'resetAll',
        },
      },
    },
  },
})

export type MigrationUiSnapshot = SnapshotFrom<typeof migrationUiMachine>
