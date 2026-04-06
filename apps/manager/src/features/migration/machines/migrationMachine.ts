import type { Hex } from 'viem'
import { assign, setup } from 'xstate'
import type { SkippedName } from '@/features/migration/service/migrationService'

export type MigrationContext = {
  selectedNames: string[]
  migratedNames: string[]
  txHashes: readonly Hex[]
  skippedNames: readonly SkippedName[]
  error?: string
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
      | { type: 'MIGRATION_ERROR'; error: string }
      | { type: 'RETRY' }
      | { type: 'DONE' }
      | { type: 'RESET' },
  },
  actions: {
    resetContext: assign(() => initialContext),
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
            actions: assign({
              txHashes: ({ event }) => event.txHashes,
              skippedNames: ({ event }) => event.skipped,
              migratedNames: ({ context, event }) => [
                ...context.migratedNames,
                ...event.migratedNames,
              ],
            }),
          },
          {
            target: 'error',
            guard: ({ event }) =>
              event.skipped.length > 0 && event.txHashes.length === 0,
            actions: assign({
              txHashes: ({ event }) => event.txHashes,
              skippedNames: ({ event }) => event.skipped,
              error: ({ event }) => {
                const count = event.skipped.length
                return `${count} name(s) could not be migrated due to pre-flight check failures.`
              },
            }),
          },
          {
            target: 'success',
            actions: assign({
              txHashes: ({ event }) => event.txHashes,
              skippedNames: () => [],
              migratedNames: ({ context, event }) => [
                ...context.migratedNames,
                ...event.migratedNames,
              ],
            }),
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
