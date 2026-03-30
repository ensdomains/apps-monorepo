import { assign, setup } from 'xstate'

export type MigrationContext = {
  selectedNames: string[]
  transactionHash?: string
  nftRevealed: boolean
}

export const migrationMachine = setup({
  types: {
    context: {} as MigrationContext,
    events: {} as
      | { type: 'SELECT_NAMES'; names: string[] }
      | { type: 'BEGIN_UPGRADE' }
      | { type: 'GAME_COMPLETE' }
      | { type: 'REVEAL_NFT' }
      | { type: 'DONE' }
      | { type: 'RESET' },
  },
}).createMachine({
  id: 'migration',
  initial: 'selectNames',
  context: {
    selectedNames: [],
    nftRevealed: false,
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
      initial: 'revealNft',
      states: {
        revealNft: {
          on: {
            REVEAL_NFT: {
              target: 'revealed',
              actions: assign({ nftRevealed: true }),
            },
          },
        },
        revealed: {
          on: {
            DONE: {
              target: '#migration.selectNames',
              actions: assign({
                selectedNames: [],
                transactionHash: undefined,
                nftRevealed: false,
              }),
            },
          },
        },
      },
    },
  },
})
