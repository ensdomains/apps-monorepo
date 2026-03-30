import { assign, setup } from 'xstate'

export type MigrationContext = {
  selectedNames: string[]
  transactionHash?: string
}

export const migrationMachine = setup({
  types: {
    context: {} as MigrationContext,
    events: {} as
      | { type: 'SELECT_NAMES'; names: string[] }
      | { type: 'BEGIN_UPGRADE' }
      | { type: 'GAME_COMPLETE' }
      | { type: 'DONE' }
      | { type: 'RESET' },
  },
}).createMachine({
  id: 'migration',
  initial: 'selectNames',
  context: {
    selectedNames: [],
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
          target: 'game',
          guard: ({ context }) => context.selectedNames.length > 0,
        },
      },
    },
    game: {
      on: {
        GAME_COMPLETE: {
          target: 'success',
        },
      },
    },
    success: {
      on: {
        DONE: {
          target: 'selectNames',
          actions: assign({
            selectedNames: [],
            transactionHash: undefined,
          }),
        },
      },
    },
  },
})
