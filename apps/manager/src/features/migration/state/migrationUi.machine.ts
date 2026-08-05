import type { Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
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
import {
  decodeMigrationError,
  type MigrationError,
} from '@/features/migration/service/decodeMigrationError'
import {
  type MigrationApproval,
  trackCreatedMigrationApproval,
} from '@/features/migration/service/migrationApprovals'
import {
  executeMigration,
  executeMigrationCleanup,
  type MigrationCleanupResult,
  type MigrationProgress,
  type MigrationResult,
  type MigrationStepDescriptor,
} from '@/features/migration/service/migrationService'
import { publicClient as defaultPublicClient } from '@/lib/wagmi'

const FAILURE_HOLD_MS = 1500

type Context = {
  wagmiConfig: WagmiConfig
  selectedNames: string[]
  plan?: MigrationPlan
  signer?: Signer
  hcaClient?: Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
  refreshAccount?: () => Promise<void>
  reconcileBeforeSubmit: boolean
  createdApprovals: readonly MigrationApproval[]
  cleanupPending: readonly MigrationApproval[]
  cleanupWalletAddress?: Address
  cleanupHcaAddress?: Address
  migrationCompleted: boolean
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
      hcaClient: Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
      refreshAccount: () => Promise<void>
    }
  | { type: 'migration.progress'; progress: MigrationProgress }
  | {
      type: 'migration.batchComplete'
      names: readonly string[]
      txHash?: Hex
    }
  | { type: 'migration.approvalCreated'; approval: MigrationApproval }
  | { type: 'migration.approvalRemoved'; approval: MigrationApproval }
  | {
      type: 'migration.complete'
      result: MigrationResult
    }
  | { type: 'migration.failed'; error: MigrationError }
  | { type: 'cleanup.retry' }
  | { type: 'cleanup.continue' }
  | {
      type: 'cleanup.restore'
      approvals: readonly MigrationApproval[]
      signer: Signer
      walletAddress: Address
      hcaAddress: Address
    }
  | { type: 'cleanup.complete'; result: MigrationCleanupResult }
  | { type: 'cleanup.failed'; error: MigrationError }
  | { type: 'retry' }
  | { type: 'done' }
  | { type: 'cancel' }

const initialContext = (wagmiConfig: WagmiConfig): Context => ({
  wagmiConfig,
  selectedNames: [],
  plan: undefined,
  reconcileBeforeSubmit: false,
  createdApprovals: [],
  cleanupPending: [],
  cleanupWalletAddress: undefined,
  cleanupHcaAddress: undefined,
  migrationCompleted: false,
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
    failureHold: FAILURE_HOLD_MS,
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
        createdApprovals: readonly MigrationApproval[]
      }
    >(({ input, sendBack }) => {
      let cancelled = false

      const onProgress = (progress: MigrationProgress) => {
        if (cancelled) return
        sendBack({ type: 'migration.progress', progress })
      }

      const onBatchComplete = (names: readonly string[], txHash?: Hex) => {
        if (cancelled) return
        sendBack({ type: 'migration.batchComplete', names, txHash })
      }

      const onApprovalCreated = (approval: MigrationApproval) => {
        if (cancelled) return
        sendBack({ type: 'migration.approvalCreated', approval })
      }

      const onApprovalRemoved = (approval: MigrationApproval) => {
        if (cancelled) return
        sendBack({ type: 'migration.approvalRemoved', approval })
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
        createdApprovals: input.createdApprovals,
        onApprovalCreated,
        onApprovalRemoved,
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
    runCleanup: fromCallback<
      Events,
      {
        wagmiConfig: WagmiConfig
        signer: Signer
        approvals: readonly MigrationApproval[]
        walletAddress: Address
        hcaAddress: Address
      }
    >(({ input, sendBack }) => {
      let cancelled = false

      executeMigrationCleanup({
        approvals: input.approvals,
        wagmiConfig: input.wagmiConfig,
        publicClient: defaultPublicClient as PublicClient,
        signer: input.signer,
        walletAddress: input.walletAddress,
        hcaAddress: input.hcaAddress,
        onProgress: (progress) => {
          if (cancelled) return
          sendBack({ type: 'migration.progress', progress })
        },
        onApprovalRemoved: (approval) => {
          if (cancelled) return
          sendBack({ type: 'migration.approvalRemoved', approval })
        },
      })
        .then((result) => {
          if (cancelled) return
          sendBack({ type: 'cleanup.complete', result })
        })
        .catch((error: unknown) => {
          if (cancelled) return
          sendBack({
            type: 'cleanup.failed',
            error: decodeMigrationError(error),
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
      context.migratedNames.length === 0,
    hasCleanupPending: ({ event }) =>
      event.type === 'migration.complete' &&
      event.result.cleanupPending.length > 0,
    isCleanupComplete: ({ event }) =>
      event.type === 'cleanup.complete' && event.result.pending.length === 0,
    hasTrackedApprovals: ({ context }) => context.createdApprovals.length > 0,
    migrationCompleted: ({ context }) => context.migrationCompleted,
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
        hcaClient: event.hcaClient,
        refreshAccount: event.refreshAccount,
        reconcileBeforeSubmit: false,
        createdApprovals: [] as readonly MigrationApproval[],
        cleanupPending: [] as readonly MigrationApproval[],
        cleanupWalletAddress: event.plan.migrationOwner,
        cleanupHcaAddress: event.plan.hcaAddress,
        migrationCompleted: false,
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
      const existing = new Set(context.migratedNames)
      const nextNames = [...context.migratedNames]
      for (const name of event.names) {
        if (!existing.has(name)) {
          nextNames.push(name)
          existing.add(name)
        }
      }
      const nextHashes = event.txHash
        ? new Set(context.txHashes).has(event.txHash)
          ? context.txHashes
          : [...context.txHashes, event.txHash]
        : context.txHashes
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
        createdApprovals: event.result.cleanupPending,
        cleanupPending: event.result.cleanupPending,
        migrationCompleted: true,
      }
    }),
    restoreCleanup: assign(({ event }) => {
      if (event.type !== 'cleanup.restore') return {}
      return {
        signer: event.signer,
        createdApprovals: event.approvals,
        cleanupPending: event.approvals,
        cleanupWalletAddress: event.walletAddress,
        cleanupHcaAddress: event.hcaAddress,
        migrationCompleted: false,
        progress: undefined,
        lastError: undefined,
      }
    }),
    prepareCancelledCleanup: assign({
      cleanupPending: ({ context }) => context.createdApprovals,
      migrationCompleted: false,
      progress: undefined,
      lastError: undefined,
    }),
    appendCreatedApproval: assign(({ event, context }) => {
      if (event.type !== 'migration.approvalCreated') return {}
      return {
        createdApprovals: trackCreatedMigrationApproval(
          context.createdApprovals,
          event.approval,
        ),
      }
    }),
    removeCreatedApproval: assign(({ event, context }) => {
      if (event.type !== 'migration.approvalRemoved') return {}
      const createdApprovals = context.createdApprovals.filter(
        (approval) => approval.id !== event.approval.id,
      )
      return {
        createdApprovals,
        cleanupPending: context.cleanupPending.filter(
          (approval) => approval.id !== event.approval.id,
        ),
      }
    }),
    recordCleanupCompletion: assign(({ event, context }) => {
      if (event.type !== 'cleanup.complete') return {}
      const existingHashes = new Set(context.txHashes)
      return {
        txHashes: [
          ...context.txHashes,
          ...event.result.txHashes.filter((hash) => !existingHashes.has(hash)),
        ],
        createdApprovals: event.result.pending,
        cleanupPending: event.result.pending,
        lastError: event.result.error
          ? decodeMigrationError(event.result.error)
          : undefined,
      }
    }),
    setCleanupError: assign({
      lastError: ({ event, context }) =>
        event.type === 'cleanup.failed' ? event.error : context.lastError,
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
    'migration.approvalCreated': {
      actions: 'appendCreatedApproval',
    },
    'migration.approvalRemoved': {
      actions: 'removeCreatedApproval',
    },
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
        'cleanup.restore': {
          target: 'cleanupRequired',
          guard: ({ event }) => event.approvals.length > 0,
          actions: 'restoreCleanup',
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
                createdApprovals: context.createdApprovals,
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
                target: '#migrationUi.cleanupRequired',
                guard: 'hasCleanupPending',
                actions: 'recordCompletion',
              },
              {
                target: 'failing',
                guard: 'isOnlyFailures',
              },
              {
                target: '#migrationUi.success',
                actions: 'recordCompletion',
              },
            ],
            'migration.failed': {
              target: 'failing',
              actions: 'setError',
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
    cleanupRequired: {
      tags: 'result',
      on: {
        'cleanup.retry': {
          target: 'cleanupRunning',
        },
        'cleanup.continue': {
          target: 'success',
          guard: 'migrationCompleted',
        },
      },
    },
    cleanupRunning: {
      tags: 'running',
      invoke: {
        id: 'runCleanup',
        src: 'runCleanup',
        input: ({ context }) => {
          if (
            !context.signer ||
            !context.cleanupWalletAddress ||
            !context.cleanupHcaAddress
          ) {
            throw new Error('Migration cleanup context is incomplete')
          }
          return {
            wagmiConfig: context.wagmiConfig,
            signer: context.signer,
            approvals: context.cleanupPending,
            walletAddress: context.cleanupWalletAddress,
            hcaAddress: context.cleanupHcaAddress,
          }
        },
      },
      on: {
        'migration.progress': {
          actions: 'setProgress',
        },
        'cleanup.complete': [
          {
            target: 'select',
            guard: ({ context, event }) =>
              event.type === 'cleanup.complete' &&
              event.result.pending.length === 0 &&
              !context.migrationCompleted,
            actions: 'resetAll',
          },
          {
            target: 'success',
            guard: 'isCleanupComplete',
            actions: 'recordCleanupCompletion',
          },
          {
            target: 'cleanupRequired',
            actions: 'recordCleanupCompletion',
          },
        ],
        'cleanup.failed': {
          target: 'cleanupRequired',
          actions: 'setCleanupError',
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
        cancel: [
          {
            target: 'cleanupRunning',
            guard: 'hasTrackedApprovals',
            actions: 'prepareCancelledCleanup',
          },
          {
            target: 'select',
            actions: 'resetAll',
          },
        ],
      },
    },
  },
})

export type MigrationUiActor = ActorRefFrom<typeof migrationUiMachine>
export type MigrationUiSnapshot = SnapshotFrom<typeof migrationUiMachine>
