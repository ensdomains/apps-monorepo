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
import { V2_CONTRACTS } from '@/features/migration/contracts/addresses'
import {
  executeMigration,
  getMigrationStepInfo,
  type MigrationProgress,
  type MigrationResult,
  type MigrationStepDescriptor,
  type SkippedName,
} from '@/features/migration/service/migrationService'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { publicClient as defaultPublicClient } from '@/lib/wagmi'

export type MigrationError =
  | { type: 'preflight-failure'; count: number }
  | { type: 'generic'; message: string }

const SUCCESS_HOLD_MS = 3000
const FAILURE_HOLD_MS = 1500

const extractErrorMessage = (err: unknown): string => {
  if (!(err instanceof Error)) return String(err)

  let deepest = err
  while ('cause' in deepest && deepest.cause instanceof Error) {
    deepest = deepest.cause
  }

  const short =
    (err as unknown as Record<string, unknown>).shortMessage ??
    (deepest as unknown as Record<string, unknown>).shortMessage

  if (typeof short === 'string') return short
  if (deepest !== err && deepest.message) return deepest.message

  return err.message || 'Migration failed'
}

type Context = {
  wagmiConfig: WagmiConfig
  selectedNames: string[]
  domains: readonly V1Domain[]
  ownerAddress?: Address
  signer?: Signer
  accountAddress?: Address
  migratedNames: string[]
  txHashes: readonly Hex[]
  skippedNames: readonly SkippedName[]
  progress?: MigrationProgress
  stepDescriptors: readonly MigrationStepDescriptor[]
  lastError?: MigrationError
}

type Events =
  | { type: 'selection.set'; names: string[] }
  | {
      type: 'migration.start'
      domains: readonly V1Domain[]
      ownerAddress: Address
      signer: Signer
      accountAddress: Address
    }
  | { type: 'migration.progress'; progress: MigrationProgress }
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
  domains: [],
  ownerAddress: undefined,
  migratedNames: [],
  txHashes: [],
  skippedNames: [],
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
        domains: readonly V1Domain[]
        ownerAddress: Address
        signer: Signer
        accountAddress: Address
      }
    >(({ input, sendBack }) => {
      let cancelled = false

      const onProgress = (progress: MigrationProgress) => {
        if (cancelled) return
        sendBack({ type: 'migration.progress', progress })
      }

      executeMigration({
        domains: [...input.domains],
        migrationOwner: input.ownerAddress,
        defaultResolver: V2_CONTRACTS.ENSV2Resolver,
        wagmiConfig: input.wagmiConfig,
        publicClient: defaultPublicClient as PublicClient,
        signer: input.signer,
        accountAddress: input.accountAddress,
        onProgress,
      })
        .then((result) => {
          if (cancelled) return
          sendBack({ type: 'migration.complete', result })
        })
        .catch((err: unknown) => {
          if (cancelled) return
          sendBack({
            type: 'migration.failed',
            error: { type: 'generic', message: extractErrorMessage(err) },
          })
        })

      return () => {
        cancelled = true
      }
    }),
  },
  guards: {
    hasSelection: ({ event }) =>
      event.type === 'migration.start' && event.domains.length > 0,
    isOnlyFailures: ({ event }) =>
      event.type === 'migration.complete' &&
      event.result.txHashes.length === 0 &&
      event.result.skipped.some((s) => s.reason !== 'already-migrated'),
    hasPartialFailures: ({ context }) => context.skippedNames.length > 0,
  },
  actions: {
    setSelection: assign({
      selectedNames: ({ event, context }) =>
        event.type === 'selection.set' ? event.names : context.selectedNames,
    }),
    captureMigrationStart: assign(({ event }) => {
      if (event.type !== 'migration.start') return {}
      const { stepDescriptors } = getMigrationStepInfo(
        [...event.domains],
        event.ownerAddress,
      )
      return {
        domains: event.domains,
        ownerAddress: event.ownerAddress,
        signer: event.signer,
        accountAddress: event.accountAddress,
        stepDescriptors,
        progress: undefined,
        lastError: undefined,
        txHashes: [] as readonly Hex[],
        skippedNames: [] as readonly SkippedName[],
      }
    }),
    setProgress: assign({
      progress: ({ event, context }) =>
        event.type === 'migration.progress' ? event.progress : context.progress,
    }),
    recordCompletion: assign(({ event, context }) => {
      if (event.type !== 'migration.complete') return {}
      return {
        txHashes: event.result.txHashes,
        skippedNames: event.result.skipped,
        migratedNames: [
          ...context.migratedNames,
          ...event.result.migratedNames,
        ],
      }
    }),
    setPreflightError: assign({
      lastError: ({ event, context }) =>
        event.type === 'migration.complete'
          ? ({
              type: 'preflight-failure',
              count: event.result.skipped.length,
            } as const)
          : context.lastError,
    }),
    setError: assign({
      lastError: ({ event, context }) =>
        event.type === 'migration.failed' ? event.error : context.lastError,
    }),
    resetForRetry: assign(({ context }) => {
      const remainingDomains = context.domains.filter(
        (d) => !context.migratedNames.includes(d.name),
      )
      const stepDescriptors = context.ownerAddress
        ? getMigrationStepInfo([...remainingDomains], context.ownerAddress)
            .stepDescriptors
        : context.stepDescriptors
      return {
        lastError: undefined,
        skippedNames: [] as readonly SkippedName[],
        txHashes: [] as readonly Hex[],
        progress: undefined,
        selectedNames: context.selectedNames.filter(
          (n) => !context.migratedNames.includes(n),
        ),
        domains: remainingDomains,
        stepDescriptors,
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
            input: ({ context }) => ({
              wagmiConfig: context.wagmiConfig,
              domains: context.domains,
              ownerAddress: context.ownerAddress!,
              signer: context.signer!,
              accountAddress: context.accountAddress!,
            }),
          },
          on: {
            'migration.progress': {
              actions: 'setProgress',
            },
            'migration.complete': [
              {
                target: 'failing',
                guard: 'isOnlyFailures',
                actions: ['recordCompletion', 'setPreflightError'],
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
            successHold: [
              {
                target: '#migrationUi.partialSuccess',
                guard: 'hasPartialFailures',
              },
              {
                target: '#migrationUi.success',
              },
            ],
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
    partialSuccess: {
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

export type MigrationUiActor = ActorRefFrom<typeof migrationUiMachine>
export type MigrationUiSnapshot = SnapshotFrom<typeof migrationUiMachine>
