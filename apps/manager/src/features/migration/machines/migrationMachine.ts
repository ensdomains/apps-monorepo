import type { Hex } from 'viem'
import { assign, setup } from 'xstate'
import type { SkippedName } from '@/features/migration/service/migrationService'

export type MigrationError =
  | { type: 'preflight-failure'; count: number }
  | { type: 'generic'; message: string }

export type MigrationContext = {
  selectedNames: string[]
  migratedNames: string[]
  txHashes: readonly Hex[]
  skippedNames: readonly SkippedName[]
  error?: MigrationError
}

const initialContext: MigrationContext = {
  selectedNames: [],
  migratedNames: [],
  txHashes: [],
  skippedNames: [],
}

export const migrationMachine = setup({
  types: {
    context: {} as MigrationContext,
    events: {} as
      | { type: 'SELECT_NAMES'; names: string[] }
      | { type: 'BEGIN_UPGRADE' }
      | {
          type: 'MIGRATION_COMPLETE'
          txHashes: readonly Hex[]
          skipped: readonly SkippedName[]
          migratedNames: string[]
        }
      | { type: 'MIGRATION_ERROR'; error: MigrationError }
      | { type: 'RETRY' }
      | { type: 'DONE' }
      | { type: 'RESET' },
  },
  actions: {
    resetContext: assign(() => initialContext),
    recordCompletion: assign({
      txHashes: ({ event }) =>
        event.type === 'MIGRATION_COMPLETE' ? event.txHashes : [],
      migratedNames: ({ context, event }) =>
        event.type === 'MIGRATION_COMPLETE'
          ? [...context.migratedNames, ...event.migratedNames]
          : context.migratedNames,
    }),
  },
}).createMachine({
  id: 'migration',
  initial: 'selectNames',
  context: initialContext,
  states: {
    selectNames: {
      on: {
        SELECT_NAMES: {
          actions: assign({
            selectedNames: ({ event }) => event.names,
          }),
        },
        BEGIN_UPGRADE: {
          target: 'migrating',
          guard: ({ context }) => context.selectedNames.length > 0,
        },
      },
    },
    migrating: {
      on: {
        MIGRATION_COMPLETE: [
          {
            target: 'partialSuccess',
            guard: ({ event }) =>
              event.skipped.length > 0 && event.txHashes.length > 0,
            actions: [
              'recordCompletion',
              assign({ skippedNames: ({ event }) => event.skipped }),
            ],
          },
          {
            target: 'error',
            guard: ({ event }) =>
              event.skipped.length > 0 && event.txHashes.length === 0,
            actions: assign({
              txHashes: ({ event }) => event.txHashes,
              skippedNames: ({ event }) => event.skipped,
              error: ({ event }) => ({
                type: 'preflight-failure' as const,
                count: event.skipped.length,
              }),
            }),
          },
          {
            target: 'success',
            actions: ['recordCompletion', assign({ skippedNames: () => [] })],
          },
        ],
        MIGRATION_ERROR: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    partialSuccess: {
      on: {
        DONE: {
          target: 'selectNames',
          actions: 'resetContext',
        },
      },
    },
    success: {
      on: {
        DONE: {
          target: 'selectNames',
          actions: 'resetContext',
        },
      },
    },
    error: {
      on: {
        RETRY: {
          target: 'migrating',
          actions: assign({
            error: () => undefined,
            skippedNames: () => [],
            txHashes: () => [],
            selectedNames: ({ context }) =>
              context.selectedNames.filter(
                (n) => !context.migratedNames.includes(n),
              ),
          }),
        },
        RESET: {
          target: 'selectNames',
          actions: 'resetContext',
        },
      },
    },
  },
})
