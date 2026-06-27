import type { Signer } from '@ens-apps/transaction-manager'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, Hex, PublicClient } from 'viem'
import {
  type ActorRefFrom,
  assign,
  fromCallback,
  type SnapshotFrom,
  setup,
} from 'xstate'
import {
  adjustPlanForRetry,
  type MigrationPlan,
} from '@/features/migration/service/buildMigrationPlan'
import type { RenewableGraceName } from '@/features/migration/service/classifyNames'
import {
  decodeMigrationError,
  type MigrationError,
} from '@/features/migration/service/decodeMigrationError'
import {
  executeMigration,
  type MigrationProgress,
  type MigrationResult,
  type MigrationStepDescriptor,
} from '@/features/migration/service/migrationService'
import { publicClient as defaultPublicClient } from '@/lib/wagmi'
import {
  executeLegacyGraceRenewals,
  type LegacyGraceRenewalProgress,
  type LegacyGraceRenewalResult,
} from '../service/legacyGraceRenewal'

const SUCCESS_HOLD_MS = 3000
const FAILURE_HOLD_MS = 1500

const graceRenewalProgressToMigrationProgress = (
  progress: LegacyGraceRenewalProgress,
): MigrationProgress => ({
  currentStep: Math.max(0, progress.current - 1),
  totalSteps: progress.total,
  description: progress.description,
  txHash: progress.txHash,
})

type Context = {
  wagmiConfig: WagmiConfig
  selectedNames: string[]
  plan?: MigrationPlan
  signer?: Signer
  accountAddress?: Address
  renewableGraceNames: readonly RenewableGraceName[]
  renewedGraceNames: string[]
  renewalTxHashes: readonly Hex[]
  renewalProgress?: LegacyGraceRenewalProgress
  migratedNames: string[]
  txHashes: readonly Hex[]
  progress?: MigrationProgress
  stepDescriptors: readonly MigrationStepDescriptor[]
  lastError?: MigrationError
}

type Events =
  | { type: 'selection.set'; names: string[] }
  | {
      type: 'migration.start'
      plan: MigrationPlan
      signer: Signer
      accountAddress: Address
    }
  | {
      type: 'graceRenewal.start'
      names: readonly RenewableGraceName[]
      signer: Signer
      accountAddress: Address
    }
  | { type: 'graceRenewal.progress'; progress: LegacyGraceRenewalProgress }
  | {
      type: 'graceRenewal.nameComplete'
      name: string
      txHash: Hex
    }
  | {
      type: 'graceRenewal.complete'
      result: LegacyGraceRenewalResult
    }
  | { type: 'migration.progress'; progress: MigrationProgress }
  | {
      type: 'migration.batchComplete'
      names: readonly string[]
      txHash: Hex
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
  plan: undefined,
  renewableGraceNames: [],
  renewedGraceNames: [],
  renewalTxHashes: [],
  renewalProgress: undefined,
  migratedNames: [],
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
    successHold: SUCCESS_HOLD_MS,
    failureHold: FAILURE_HOLD_MS,
  },
  actors: {
    runMigration: fromCallback<
      Events,
      {
        wagmiConfig: WagmiConfig
        plan: MigrationPlan
        signer: Signer
        accountAddress: Address
      }
    >(({ input, sendBack }) => {
      let cancelled = false

      const onProgress = (progress: MigrationProgress) => {
        if (cancelled) return
        sendBack({ type: 'migration.progress', progress })
      }

      const onBatchComplete = (names: readonly string[], txHash: Hex) => {
        if (cancelled) return
        sendBack({ type: 'migration.batchComplete', names, txHash })
      }

      executeMigration({
        plan: input.plan,
        wagmiConfig: input.wagmiConfig,
        publicClient: defaultPublicClient as PublicClient,
        signer: input.signer,
        accountAddress: input.accountAddress,
        onProgress,
        onBatchComplete,
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
    runGraceRenewals: fromCallback<
      Events,
      {
        names: readonly RenewableGraceName[]
        signer: Signer
        accountAddress: Address
      }
    >(({ input, sendBack }) => {
      let cancelled = false

      executeLegacyGraceRenewals({
        names: input.names,
        signer: input.signer,
        accountAddress: input.accountAddress,
        publicClient: defaultPublicClient as PublicClient,
        onProgress: (progress) => {
          if (cancelled) return
          sendBack({ type: 'graceRenewal.progress', progress })
        },
        onNameComplete: (name, txHash) => {
          if (cancelled) return
          sendBack({ type: 'graceRenewal.nameComplete', name, txHash })
        },
      })
        .then((result) => {
          if (cancelled) return
          sendBack({ type: 'graceRenewal.complete', result })
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
    hasGraceRenewals: ({ event }) =>
      event.type === 'graceRenewal.start' && event.names.length > 0,
    canRetryGraceRenewal: ({ context }) =>
      context.renewableGraceNames.length > 0 && !context.plan,
    isOnlyFailures: ({ event, context }) =>
      event.type === 'migration.complete' &&
      event.result.txHashes.length === 0 &&
      context.migratedNames.length === 0,
  },
  actions: {
    setSelection: assign({
      selectedNames: ({ event, context }) =>
        event.type === 'selection.set' ? event.names : context.selectedNames,
    }),
    captureMigrationStart: assign(({ event }) => {
      if (event.type !== 'migration.start') return {}
      return {
        plan: event.plan,
        signer: event.signer,
        accountAddress: event.accountAddress,
        stepDescriptors: event.plan.stepDescriptors,
        progress: undefined,
        lastError: undefined,
        txHashes: [] as readonly Hex[],
      }
    }),
    captureGraceRenewalStart: assign(({ event }) => {
      if (event.type !== 'graceRenewal.start') return {}
      return {
        renewableGraceNames: event.names,
        signer: event.signer,
        accountAddress: event.accountAddress,
        renewalProgress: undefined,
        lastError: undefined,
        renewalTxHashes: [] as readonly Hex[],
        renewedGraceNames: [] as string[],
        plan: undefined,
        progress: undefined,
        stepDescriptors: event.names.map((name, index) => ({
          type: 'renew-grace' as const,
          label: name.label,
          index,
          total: event.names.length,
        })),
      }
    }),
    setRenewalProgress: assign(({ event }) => {
      if (event.type !== 'graceRenewal.progress') return {}
      return {
        renewalProgress: event.progress,
        progress: graceRenewalProgressToMigrationProgress(event.progress),
      }
    }),
    appendGraceRenewalComplete: assign(({ event, context }) => {
      if (event.type !== 'graceRenewal.nameComplete') return {}
      const existingNames = new Set(context.renewedGraceNames)
      const renewedGraceNames = existingNames.has(event.name)
        ? context.renewedGraceNames
        : [...context.renewedGraceNames, event.name]
      const existingHashes = new Set(context.renewalTxHashes)
      const renewalTxHashes = existingHashes.has(event.txHash)
        ? context.renewalTxHashes
        : [...context.renewalTxHashes, event.txHash]
      return { renewedGraceNames, renewalTxHashes }
    }),
    recordGraceRenewalCompletion: assign(({ event, context }) => {
      if (event.type !== 'graceRenewal.complete') return {}
      const existingNames = new Set(context.renewedGraceNames)
      const existingHashes = new Set(context.renewalTxHashes)
      return {
        renewedGraceNames: [
          ...context.renewedGraceNames,
          ...event.result.renewedNames.filter(
            (name) => !existingNames.has(name),
          ),
        ],
        renewalTxHashes: [
          ...context.renewalTxHashes,
          ...event.result.txHashes.filter((hash) => !existingHashes.has(hash)),
        ],
      }
    }),
    setProgress: assign({
      progress: ({ event, context }) =>
        event.type === 'migration.progress' ? event.progress : context.progress,
    }),
    appendBatchComplete: assign(({ event, context }) => {
      if (event.type !== 'migration.batchComplete') return {}
      const existing = new Set(context.migratedNames)
      const nextNames = [...context.migratedNames]
      for (const name of event.names) {
        if (!existing.has(name)) {
          nextNames.push(name)
          existing.add(name)
        }
      }
      const existingHashes = new Set(context.txHashes)
      const nextHashes = existingHashes.has(event.txHash)
        ? context.txHashes
        : [...context.txHashes, event.txHash]
      return {
        migratedNames: nextNames,
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
      return {
        txHashes: mergedHashes,
      }
    }),
    setError: assign({
      lastError: ({ event, context }) =>
        event.type === 'migration.failed' ? event.error : context.lastError,
    }),
    resetForRetry: assign(({ context }) => {
      if (!context.plan) return {}
      const nextPlan = adjustPlanForRetry(context.plan, context.migratedNames)
      const migratedSet = new Set(context.migratedNames)
      return {
        plan: nextPlan,
        stepDescriptors: nextPlan.stepDescriptors,
        selectedNames: context.selectedNames.filter((n) => !migratedSet.has(n)),
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
        'migration.start': {
          target: 'migrate',
          guard: 'hasSelection',
          actions: 'captureMigrationStart',
        },
        'graceRenewal.start': {
          target: 'renewGrace',
          guard: 'hasGraceRenewals',
          actions: 'captureGraceRenewalStart',
        },
      },
    },
    renewGrace: {
      initial: 'running',
      states: {
        running: {
          tags: 'running',
          invoke: {
            id: 'runGraceRenewals',
            src: 'runGraceRenewals',
            input: ({ context }) => {
              if (
                context.renewableGraceNames.length === 0 ||
                !context.signer ||
                !context.accountAddress
              ) {
                throw new Error('Grace renewal context is incomplete')
              }
              return {
                names: context.renewableGraceNames,
                signer: context.signer,
                accountAddress: context.accountAddress,
              }
            },
          },
          on: {
            'graceRenewal.progress': {
              actions: 'setRenewalProgress',
            },
            'graceRenewal.nameComplete': {
              actions: 'appendGraceRenewalComplete',
            },
            'graceRenewal.complete': {
              target: 'succeeding',
              actions: 'recordGraceRenewalCompletion',
            },
            'migration.failed': {
              target: '#migrationUi.failure',
              actions: 'setError',
            },
          },
        },
        succeeding: {
          tags: 'running',
          after: {
            successHold: {
              target: '#migrationUi.select',
            },
          },
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
              if (!context.plan || !context.signer || !context.accountAddress) {
                throw new Error('Migration context is incomplete')
              }
              return {
                wagmiConfig: context.wagmiConfig,
                plan: context.plan,
                signer: context.signer,
                accountAddress: context.accountAddress,
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
                actions: 'recordCompletion',
              },
              {
                target: 'succeeding',
                actions: 'recordCompletion',
              },
            ],
            'migration.failed': {
              target: 'failing',
              actions: 'setError',
            },
          },
        },
        succeeding: {
          tags: 'running',
          after: {
            successHold: {
              target: '#migrationUi.success',
            },
          },
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
            target: 'renewGrace',
            guard: 'canRetryGraceRenewal',
            actions: 'setError',
          },
          {
            target: 'migrate',
            actions: 'resetForRetry',
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

export type MigrationUiActor = ActorRefFrom<typeof migrationUiMachine>
export type MigrationUiSnapshot = SnapshotFrom<typeof migrationUiMachine>
