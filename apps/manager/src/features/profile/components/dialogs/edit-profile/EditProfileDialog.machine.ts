import type { RhinestoneSigner, Signer } from '@ens-apps/transaction-manager'
import type { Address, PublicClient } from 'viem'
import { assign, type SnapshotFrom, setup } from 'xstate'
import type {
  SaveRecordsParams,
  ServiceRecordSnapshot,
} from '@/features/profile/service/profileRecordTransactions'
import type { ProfileRecords } from '@/features/profile/types'
import {
  newEmptyProfileRecords,
  transformToServiceFormat,
} from '@/features/profile/utils/transformRecords'
import {
  type GeneralField,
  getDefaultVisibleFields,
} from './tabs/general/fields'

const ETH_COIN_TYPE = 60

interface SaveDeps {
  readonly accountAddress?: Address | null
  readonly chainId: number
  readonly name: string
  readonly owner?: Address
  readonly ownerAddress?: Address | null
  readonly publicClient: PublicClient
  readonly retryCount?: number
  readonly signer?: Signer | null
  /**
   * When true, deploy/assign a controlled resolver and apply the before→after
   * record diff instead of writing in place.
   */
  readonly needsResolverSetup?: boolean
}

interface PendingUpdateSave {
  readonly kind: 'update'
  readonly currentRecords: ProfileRecords
  readonly params: SaveRecordsParams
}

interface PendingSetupSave {
  readonly kind: 'setup'
  readonly currentRecords: ProfileRecords
  readonly before: ServiceRecordSnapshot
  readonly after: ServiceRecordSnapshot
  readonly ethAddressChanged: boolean
  readonly name: string
  readonly chainId: number
  readonly ownerAddress: Address
  readonly signer: RhinestoneSigner
  readonly publicClient: PublicClient
}

const ethCoinValue = (coins: readonly { coinType: number; value: string }[]) =>
  coins.find(({ coinType }) => coinType === ETH_COIN_TYPE)?.value

export type PendingSave = PendingUpdateSave | PendingSetupSave

interface EditProfileDialogContext {
  readonly ethAddressChanged: boolean
  readonly pendingSave?: PendingSave
  readonly savedRecords: ProfileRecords
  readonly visibleFields: ReadonlySet<GeneralField>
}

interface EditProfileDialogInput {
  readonly records: ProfileRecords
}

type EditProfileDialogEvent =
  | { type: 'OPEN'; records: ProfileRecords }
  | { type: 'CLOSE' }
  | { type: 'RESET_SAVE_STATE' }
  | { type: 'SHOW_GENERAL_FIELD'; field: GeneralField }
  | { type: 'TOGGLE_GENERAL_FIELD'; field: GeneralField }
  | { type: 'SAVE_REQUESTED'; values: ProfileRecords; deps: SaveDeps }
  | {
      type: 'SAVE_SUCCEEDED'
      currentRecords: ProfileRecords
      ethAddressChanged?: boolean
    }

const getMissingAccount = (event: EditProfileDialogEvent) =>
  event.type === 'SAVE_REQUESTED' &&
  (!event.deps.signer || !event.deps.accountAddress)

const getMissingSetupSigner = (event: EditProfileDialogEvent) =>
  event.type === 'SAVE_REQUESTED' &&
  Boolean(event.deps.needsResolverSetup) &&
  (event.deps.signer?.type !== 'rhinestone' || !event.deps.ownerAddress)

const getPendingSave = (
  savedRecords: ProfileRecords,
  currentRecords: ProfileRecords,
  deps: SaveDeps,
): PendingSave => {
  if (!deps.signer || !deps.accountAddress) {
    throw new Error('Account not ready. Please wait for wallet to connect.')
  }

  const before = transformToServiceFormat(savedRecords)
  const after = transformToServiceFormat(currentRecords)
  const ethAddressChanged =
    ethCoinValue(before.coins) !== ethCoinValue(after.coins)

  if (deps.needsResolverSetup) {
    if (deps.signer.type !== 'rhinestone' || !deps.ownerAddress) {
      throw new Error('Please finish connecting your wallet, then try again')
    }

    return {
      kind: 'setup',
      currentRecords: newEmptyProfileRecords(),
      before,
      after,
      ethAddressChanged,
      name: deps.name,
      chainId: deps.chainId,
      ownerAddress: deps.ownerAddress,
      signer: deps.signer,
      publicClient: deps.publicClient,
    }
  }

  if (!savedRecords.resolverAddress) {
    throw new Error('Cannot save profile - resolver address is not available.')
  }

  return {
    kind: 'update',
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
      retryCount: deps.retryCount,
    },
  }
}

const saveRequestedTransitions = [
  {
    guard: 'missingOwner',
    target: 'idle',
    actions: 'clearSaveState',
  },
  {
    guard: 'missingAccount',
    target: 'idle',
    actions: 'clearSaveState',
  },
  {
    guard: 'missingSetupSigner',
    target: 'idle',
    actions: 'clearSaveState',
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
    missingSetupSigner: ({ event }) => getMissingSetupSigner(event),
  },
  actions: {
    openDialog: assign({
      ethAddressChanged: () => false,
      pendingSave: () => undefined,
      savedRecords: ({ event, context }) =>
        event.type === 'OPEN' ? event.records : context.savedRecords,
      visibleFields: ({ event, context }) =>
        event.type === 'OPEN'
          ? getDefaultVisibleFields(event.records)
          : context.visibleFields,
    }),
    clearSaveState: assign({
      ethAddressChanged: () => false,
      pendingSave: () => undefined,
    }),
    showGeneralField: assign({
      visibleFields: ({ context, event }) => {
        if (
          event.type !== 'SHOW_GENERAL_FIELD' ||
          context.visibleFields.has(event.field)
        ) {
          return context.visibleFields
        }

        return new Set(context.visibleFields).add(event.field)
      },
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
    assignPendingSave: assign({
      ethAddressChanged: () => false,
      pendingSave: ({ context, event }) =>
        event.type === 'SAVE_REQUESTED'
          ? getPendingSave(context.savedRecords, event.values, event.deps)
          : undefined,
    }),
    completeEventSave: assign({
      ethAddressChanged: ({ event }) =>
        event.type === 'SAVE_SUCCEEDED'
          ? (event.ethAddressChanged ?? false)
          : false,
      pendingSave: () => undefined,
      savedRecords: ({ event, context }) =>
        event.type === 'SAVE_SUCCEEDED'
          ? event.currentRecords
          : context.savedRecords,
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
        SHOW_GENERAL_FIELD: {
          actions: 'showGeneralField',
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
          },
        },
        success: {
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
