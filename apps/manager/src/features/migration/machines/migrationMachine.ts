import type { Hex } from 'viem'
import { assign, setup } from 'xstate'
import type { SkippedName } from '@/features/migration/service/migrationService'

export type MigrationContext = {
  selectedNames: string[]
  txHashes: Hex[]
  skippedNames: SkippedName[]
  error?: string
}

export const migrationMachine = setup({
  types: {
    context: {} as MigrationContext,
    events: {} as
      | { type: 'SELECT_NAMES'; names: string[] }
      | { type: 'BEGIN_UPGRADE' }
      | {
          type: 'MIGRATION_COMPLETE'
          txHashes: Hex[]
          skipped: SkippedName[]
        }
      | { type: 'MIGRATION_ERROR'; error: string }
      | { type: 'RETRY' }
      | { type: 'DONE' }
      | { type: 'RESET' },
  },
}).createMachine({
  id: 'migration',
  initial: 'selectNames',
  context: {
    selectedNames: [],
    txHashes: [],
    skippedNames: [],
  },
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
            target: 'error',
            guard: ({ event }) => event.skipped.length > 0,
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
    success: {
      on: {
        DONE: {
          target: 'selectNames',
          actions: assign({
            selectedNames: () => [],
            txHashes: () => [],
            skippedNames: () => [],
            error: () => undefined,
          }),
        },
      },
    },
    error: {
      on: {
        RETRY: {
          target: 'migrating',
          actions: assign({
            error: () => undefined,
          }),
        },
        RESET: {
          target: 'selectNames',
          actions: assign({
            selectedNames: () => [],
            txHashes: () => [],
            skippedNames: () => [],
            error: () => undefined,
          }),
        },
      },
    },
  },
})
