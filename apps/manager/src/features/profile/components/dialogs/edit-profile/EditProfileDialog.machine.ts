import type { EOASigner } from '@ens-apps/transaction-manager'
import type { Address, PublicClient, WalletClient } from 'viem'
import { assign, type SnapshotFrom, setup } from 'xstate'
import type {
  SaveRecordsParams,
  ServiceRecordSnapshot,
} from '@/features/profile/service/profileRecordTransactions'
import type { ProfileRecords } from '@/features/profile/types'
import { transformToServiceFormat } from '@/features/profile/utils/transformRecords'
import { hasOwnerWallet } from '@/lib/wallet'
import {
  type GeneralField,
  getDefaultVisibleFields,
} from './tabs/general/fields'

const ETH_COIN_TYPE = 60

export interface SaveDeps {
  readonly chainId: number
  readonly name: string
  readonly owner?: Address
  readonly ownerAddress?: Address | null
  readonly publicClient: PublicClient
  readonly retryCount?: number
  /** Connected owner wallet; the sender for every profile write. */
  readonly walletClient?: WalletClient | null
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
  readonly signer: EOASigner
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

const getPendingSave = (
  savedRecords: ProfileRecords,
  currentRecords: ProfileRecords,
  deps: SaveDeps,
): PendingSave => {
  const before = transformToServiceFormat(savedRecords)
  const after = transformToServiceFormat(currentRecords)
  const ethAddressChanged =
    ethCoinValue(before.coins) !== ethCoinValue(after.coins)

  if (deps.needsResolverSetup) {
    if (!hasOwnerWallet(deps.walletClient, deps.ownerAddress)) {
      throw new Error('Please finish connecting your wallet, then try again')
    }

    return {
      kind: 'setup',
      currentRecords,
      before,
      after,
      ethAddressChanged,
      name: deps.name,
      chainId: deps.chainId,
      ownerAddress: deps.walletClient.account.address,
      signer: { type: 'eoa', walletClient: deps.walletClient },
      publicClient: deps.publicClient,
    }
  }

  if (!savedRecords.resolverAddress) {
    throw new Error('Cannot save profile - resolver address is not available.')
  }

  // In-place record writes are ALWAYS plain owner-EOA transactions, never HCA
  // intents. Registration hands the owner wallet every role on the resolver
  // (the resolver's `initialize` grants it the root roles alongside the HCA),
  // so the EOA can write directly. Routing the same write through the
  // HCA instead fails twice over: a session-signed intent hits
  // `HCAOwnerAndSessionValidator`, whose action policy allowlists only the
  // registration selectors, and reverts `PolicyRuleFailed()` re-wrapped as
  // `InvalidSignature()`; an owner-signed one needs USDC for the intent fee
  // that registration leaves the HCA without, with no funding leg here to
  // cover it.
  if (!hasOwnerWallet(deps.walletClient, deps.ownerAddress)) {
    throw new Error('Account not ready. Please wait for wallet to connect.')
  }

  return {
    kind: 'update',
    currentRecords,
    params: {
      name: deps.name,
      before,
      after,
      signer: { type: 'eoa', walletClient: deps.walletClient },
      accountAddress: deps.walletClient.account.address,
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
    missingAccount: ({ event }) =>
      event.type === 'SAVE_REQUESTED' &&
      !hasOwnerWallet(event.deps.walletClient, event.deps.ownerAddress),
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
