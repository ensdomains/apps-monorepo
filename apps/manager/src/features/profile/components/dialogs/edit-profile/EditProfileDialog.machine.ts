import type { Signer } from '@ens-apps/transaction-manager'
import type { Address, Hex, PublicClient } from 'viem'
import { assign, type SnapshotFrom, setup } from 'xstate'
import type { ProfileRecords } from '@/features/profile/types'
import { transformToServiceFormat } from '@/features/profile/utils/transformRecords'
import type { SaveRecordsParams } from '../../ProfileEdit.transactions'
import {
  type GeneralField,
  getDefaultVisibleFields,
} from './tabs/general/fields'

interface SaveDeps {
  readonly accountAddress?: Address | null
  readonly chainId: number
  readonly name: string
  readonly owner?: Address
  readonly ownerAddress?: Address | null
  readonly publicClient: PublicClient
  readonly signer?: Signer | null
}

interface PendingSave {
  readonly currentRecords: ProfileRecords
  readonly params: SaveRecordsParams
}

interface EditProfileDialogContext {
  readonly ethAddressChanged: boolean
  readonly localSaveError?: string
  readonly pendingSave?: PendingSave
  readonly savedRecords: ProfileRecords
  readonly txHash?: Hex
  readonly visibleFields: ReadonlySet<GeneralField>
}

interface EditProfileDialogInput {
  readonly records: ProfileRecords
}

type EditProfileDialogEvent =
  | { type: 'OPEN'; records: ProfileRecords }
  | { type: 'CLOSE' }
  | { type: 'RESET_SAVE_STATE' }
  | { type: 'TOGGLE_GENERAL_FIELD'; field: GeneralField }
  | { type: 'SAVE_REQUESTED'; values: ProfileRecords; deps: SaveDeps }
  | {
      type: 'SAVE_SUCCEEDED'
      currentRecords: ProfileRecords
      txHash?: Hex
      ethAddressChanged?: boolean
    }
  | { type: 'SAVE_FAILED'; errorMessage: string }

const getMissingAccount = (event: EditProfileDialogEvent) =>
  event.type === 'SAVE_REQUESTED' &&
  (!event.deps.signer || !event.deps.accountAddress)

const getPendingSave = (
  savedRecords: ProfileRecords,
  currentRecords: ProfileRecords,
  deps: SaveDeps,
): PendingSave => {
  if (!deps.signer || !deps.accountAddress) {
    throw new Error('Account not ready. Please wait for wallet to connect.')
  }

  if (!savedRecords.resolverAddress) {
    throw new Error('Cannot save profile - resolver address is not available.')
  }

  const before = transformToServiceFormat(savedRecords)
  const after = transformToServiceFormat(currentRecords)

  return {
    currentRecords,
    params: {
      name: deps.name,
      before,
      after,
      signer: deps.signer,
      accountAddress: deps.ownerAddress ?? deps.accountAddress,
      publicClient: deps.publicClient,
      chainId: deps.chainId,
      resolverAddress: savedRecords.resolverAddress,
    },
  }
}

const saveRequestedTransitions = [
  {
    guard: 'missingOwner',
    target: 'error',
    actions: 'setMissingOwnerError',
  },
  {
    guard: 'missingAccount',
    target: 'error',
    actions: 'setMissingAccountError',
  },
  {
    guard: 'missingResolver',
    target: 'error',
    actions: 'setMissingResolverError',
  },
  {
    target: 'saving',
    actions: 'assignPendingSave',
  },
] as const

export const editProfileDialogMachine = setup({
  types: {
    context: {} as EditProfileDialogContext,
    events: {} as EditProfileDialogEvent,
    input: {} as EditProfileDialogInput,
  },
  guards: {
    missingOwner: ({ event }) =>
      event.type === 'SAVE_REQUESTED' && !event.deps.owner,
    missingAccount: ({ event }) => getMissingAccount(event),
    missingResolver: ({ context }) => !context.savedRecords.resolverAddress,
  },
  actions: {
    openDialog: assign({
      ethAddressChanged: () => false,
      localSaveError: () => undefined,
      pendingSave: () => undefined,
      savedRecords: ({ event, context }) =>
        event.type === 'OPEN' ? event.records : context.savedRecords,
      txHash: () => undefined,
      visibleFields: ({ event, context }) =>
        event.type === 'OPEN'
          ? getDefaultVisibleFields(event.records)
          : context.visibleFields,
    }),
    clearSaveState: assign({
      ethAddressChanged: () => false,
      localSaveError: () => undefined,
      pendingSave: () => undefined,
      txHash: () => undefined,
    }),
    toggleGeneralField: assign({
      visibleFields: ({ context, event }) => {
        if (event.type !== 'TOGGLE_GENERAL_FIELD') {
          return context.visibleFields
        }

        const next = new Set(context.visibleFields)
        if (next.has(event.field)) {
          next.delete(event.field)
        } else {
          next.add(event.field)
        }
        return next
      },
    }),
    setMissingOwnerError: assign({
      ethAddressChanged: () => false,
      localSaveError: () => 'Cannot save profile - ENS owner is not available.',
      pendingSave: () => undefined,
      txHash: () => undefined,
    }),
    setMissingAccountError: assign({
      ethAddressChanged: () => false,
      localSaveError: () =>
        'Account not ready. Please wait for wallet to connect.',
      pendingSave: () => undefined,
      txHash: () => undefined,
    }),
    setMissingResolverError: assign({
      ethAddressChanged: () => false,
      localSaveError: () =>
        'Cannot save profile - resolver address is not available.',
      pendingSave: () => undefined,
      txHash: () => undefined,
    }),
    assignPendingSave: assign({
      ethAddressChanged: () => false,
      localSaveError: () => undefined,
      pendingSave: ({ context, event }) =>
        event.type === 'SAVE_REQUESTED'
          ? getPendingSave(context.savedRecords, event.values, event.deps)
          : undefined,
      txHash: () => undefined,
    }),
    completeEventSave: assign({
      ethAddressChanged: ({ event }) =>
        event.type === 'SAVE_SUCCEEDED'
          ? (event.ethAddressChanged ?? false)
          : false,
      localSaveError: () => undefined,
      pendingSave: () => undefined,
      savedRecords: ({ event, context }) =>
        event.type === 'SAVE_SUCCEEDED'
          ? event.currentRecords
          : context.savedRecords,
      txHash: ({ event }) =>
        event.type === 'SAVE_SUCCEEDED' ? event.txHash : undefined,
    }),
    failEventSave: assign({
      ethAddressChanged: () => false,
      localSaveError: ({ event }) =>
        event.type === 'SAVE_FAILED' ? event.errorMessage : undefined,
      pendingSave: () => undefined,
      txHash: () => undefined,
    }),
  },
}).createMachine({
  id: 'editProfileDialog',
  context: ({ input }) => ({
    ethAddressChanged: false,
    savedRecords: input.records,
    visibleFields: getDefaultVisibleFields(input.records),
  }),
  initial: 'closed',
  states: {
    closed: {
      on: {
        OPEN: {
          target: 'editing.idle',
          actions: 'openDialog',
        },
      },
    },
    editing: {
      initial: 'idle',
      on: {
        CLOSE: {
          target: 'closed',
        },
        RESET_SAVE_STATE: {
          target: '.idle',
          actions: 'clearSaveState',
        },
        TOGGLE_GENERAL_FIELD: {
          actions: 'toggleGeneralField',
        },
      },
      states: {
        idle: {
          on: {
            SAVE_REQUESTED: saveRequestedTransitions,
          },
        },
        saving: {
          on: {
            SAVE_SUCCEEDED: {
              target: 'success',
              actions: 'completeEventSave',
            },
            SAVE_FAILED: {
              target: 'error',
              actions: 'failEventSave',
            },
          },
        },
        success: {
          on: {
            SAVE_REQUESTED: saveRequestedTransitions,
          },
        },
        error: {
          on: {
            SAVE_REQUESTED: saveRequestedTransitions,
          },
        },
      },
    },
  },
})

export type EditProfileDialogSnapshot = SnapshotFrom<
  typeof editProfileDialogMachine
>
