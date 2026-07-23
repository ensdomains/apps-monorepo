import {
  type RegistrationEvent,
  registrationMachine,
  type Signer,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { match } from 'ts-pattern'
import {
  type Address,
  isAddressEqual,
  type PublicClient,
  type WalletClient,
} from 'viem'
import {
  type ActorRefFrom,
  assign,
  enqueueActions,
  fromPromise,
  raise,
  type SnapshotFrom,
  sendTo,
  setup,
} from 'xstate'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { MIN_REGISTER_DURATION_SECONDS } from '@/features/register/components/Pricing/utils'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import { publicClient as defaultPublicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'
import {
  submitPrimaryNameForward,
  submitPrimaryNameReverse,
} from '../../profile/service/setPrimaryName'
import { startSyncEthAddressRecordTransaction } from '../service/syncEthAddressRecord'
import { getDurationInSecondsFromYears } from '../utils/time'
import {
  getRegistrationStageProgress,
  type MaxProgressReached,
  REGISTRATION_STAGE_PROGRESS,
  type RegistrationStage,
} from './registration.stages'
import type { RegistrationPostRegistrationSetup } from './registrationAutoSetup'

export const REGISTRATION_V2_ACTOR_ID = 'registrationActor'

type RegistrationSnapshot = SnapshotFrom<typeof registrationMachine>

type PostRegistrationData = {
  label: string
  signer: Signer
  walletClient: WalletClient | null
  accountAddress: Address
  ownerAddress: Address
  publicClient: PublicClient
  chainId: number
  resolverAddress?: Address
}

type PostRegistrationProgress = {
  ethRecordSynced: boolean
  primaryNameForwardConfirmed: boolean
}

type Context = {
  chainId: number
  duration: number
  selectedToken: SUPPORTED_TOKEN | undefined
  lastErrorMessage?: string
  confirmedData?: {
    label: string
    duration: bigint
    ownerAddress: Address
    token: SUPPORTED_TOKEN
    totalPrice: bigint
    basePriceNumber: number
    premiumPriceNumber: number
  }
  postRegistrationSetup?: RegistrationPostRegistrationSetup
  postRegistrationData?: PostRegistrationData
  postRegistrationProgress: PostRegistrationProgress
  registrationCompleted: boolean
  postRegistrationSetupFailed: boolean
  ethRecordSyncTxId?: string
  primaryNameTxId?: string
  maxProgressReached?: MaxProgressReached
}

type Events =
  | { type: 'pricing.step.next' }
  | { type: 'pricing.step.previous' }
  | { type: 'pricing.dialog.dismiss' }
  | { type: 'pricing.duration.set'; duration: number }
  | { type: 'pricing.token.select'; token: SUPPORTED_TOKEN | undefined }
  | {
      type: 'registration.start'
      label: string
      duration: bigint
      token: SUPPORTED_TOKEN
      totalPrice: bigint
      account: SmartAccountContextValue
      basePriceNumber: number
      premiumPriceNumber: number
      postRegistrationSetup?: RegistrationPostRegistrationSetup
    }
  | { type: 'registration.completed' }
  | { type: 'notifications.step.next' }
  | { type: 'transaction.success' }
  | { type: 'transaction.failed'; message?: string }
  | { type: 'retry' }
  | { type: 'cancel' }
  | { type: 'label.changed' }
  | { type: '$error'; error: Error }

type Input = {
  chainId: number
}

const INITIAL_POST_REGISTRATION_PROGRESS: PostRegistrationProgress = {
  ethRecordSynced: false,
  primaryNameForwardConfirmed: false,
}

const isRegistrationSnapshotEvent = (
  event: unknown,
): event is { snapshot: RegistrationSnapshot } =>
  !!event && typeof event === 'object' && 'snapshot' in event

const shouldSyncEthRecord = (context: Context) =>
  context.postRegistrationSetup?.primaryName?.syncEthRecord === true

const shouldSetPrimaryName = (context: Context) =>
  context.postRegistrationSetup?.primaryName?.enabled === true

const asEthName = (label: string) => `${label}.eth`

// Primary names are an EOA interaction: the reverse registrars key on
// msg.sender, so the owner wallet must send the transactions itself (an
// HCA-sent setName writes the smart account's reverse node instead). The
// owner wallet client is therefore required on every signer path, and it must
// still control the captured owner address (the pair can diverge if the user
// switches accounts mid-registration).
const canSetPrimaryName = (context: Context) => {
  if (!shouldSetPrimaryName(context) || !context.postRegistrationData) {
    return false
  }

  const { walletClient, ownerAddress } = context.postRegistrationData

  // Require a bound account that matches: an account-less client (possible
  // mid-reconnect) gives no way to verify the wallet controls the owner
  // address, so treat it as unavailable rather than submitting blind.
  return (
    !!walletClient?.account &&
    isAddressEqual(walletClient.account.address, ownerAddress)
  )
}

const hasPrimaryNameForwardRemaining = (context: Context) =>
  canSetPrimaryName(context) &&
  !context.postRegistrationProgress.primaryNameForwardConfirmed

const hasPrimaryNameReverseRemaining = (context: Context) =>
  canSetPrimaryName(context) &&
  context.postRegistrationProgress.primaryNameForwardConfirmed

const updateMaxProgress = (
  current: MaxProgressReached | undefined,
  stage: RegistrationStage,
): MaxProgressReached => {
  const progress = getRegistrationStageProgress(stage)
  if (current && progress <= current.progress) {
    return current
  }
  return { stage, progress }
}

const machineSetup = setup({
  types: {
    context: {} as Context,
    events: {} as Events,
    input: {} as Input,
    children: {} as {
      [REGISTRATION_V2_ACTOR_ID]: 'registrationFlow'
    },
  },
  actors: {
    registrationFlow: registrationMachine,
    submitEthRecordTransaction: fromPromise(
      async ({ input }: { input: Required<PostRegistrationData> }) =>
        startSyncEthAddressRecordTransaction({
          name: asEthName(input.label),
          ownerAddress: input.ownerAddress,
          resolverAddress: input.resolverAddress,
          signer: input.signer,
          accountAddress: input.accountAddress,
          publicClient: input.publicClient,
          chainId: input.chainId,
        }),
    ),
    waitForKnownTransaction: fromPromise(
      async ({ input }: { input: { txId: string } }) =>
        waitForTransaction(input.txId),
    ),
  },
  guards: {
    isDurationValid: ({ context }) =>
      context.duration >= MIN_REGISTER_DURATION_SECONDS,
    hasEthRecordSyncRemaining: ({ context }) =>
      shouldSyncEthRecord(context) &&
      !context.postRegistrationProgress.ethRecordSynced,
    hasPrimaryNameForwardRemaining: ({ context }) =>
      hasPrimaryNameForwardRemaining(context),
    hasPrimaryNameReverseRemaining: ({ context }) =>
      hasPrimaryNameReverseRemaining(context),
    // Setup was requested but the primary-name legs can't be sent (no owner
    // wallet client, or it no longer controls the owner address): surface the
    // failure notice instead of silently reporting success.
    primaryNameSetupUnavailable: ({ context }) =>
      shouldSetPrimaryName(context) &&
      !canSetPrimaryName(context) &&
      !context.postRegistrationProgress.primaryNameForwardConfirmed,
    hasEthRecordSyncTxId: ({ context }) => !!context.ethRecordSyncTxId,
    hasPrimaryNameTxId: ({ context }) => !!context.primaryNameTxId,
  },
  actions: {
    setDuration: assign({
      duration: ({ event }) =>
        event.type === 'pricing.duration.set'
          ? event.duration
          : getDurationInSecondsFromYears(1),
    }),
    setToken: assign({
      selectedToken: ({ event, context }) =>
        event.type === 'pricing.token.select'
          ? event.token
          : context.selectedToken,
    }),
    clearError: assign({
      lastErrorMessage: () => undefined,
    }),
    clearMaxProgress: assign({
      maxProgressReached: () => undefined,
    }),
    setError: assign({
      lastErrorMessage: ({ event }) =>
        match(event)
          .with({ type: 'transaction.failed' }, ({ message }) => message)
          .with({ type: '$error' }, ({ error }) => error.message)
          .otherwise(() => undefined),
    }),
    setInvokeError: assign({
      lastErrorMessage: ({ event }) => {
        const error = (event as { error?: unknown }).error
        return error instanceof Error ? error.message : String(error)
      },
    }),
    forwardRetry: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'RETRY' }),
    forwardCancel: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'CANCEL' }),
    clearRegistrationData: assign({
      confirmedData: () => undefined,
      postRegistrationSetup: () => undefined,
      postRegistrationData: () => undefined,
      postRegistrationProgress: () => INITIAL_POST_REGISTRATION_PROGRESS,
      registrationCompleted: () => false,
      postRegistrationSetupFailed: () => false,
      ethRecordSyncTxId: () => undefined,
      primaryNameTxId: () => undefined,
    }),
    invalidateNameQueries: ({ context }) => {
      const label = context.confirmedData?.label
      const ownerAddress = context.postRegistrationData?.ownerAddress
      const queryClient = getQueryClient()
      if (!queryClient) return

      if (label) {
        queryClient.invalidateQueries({
          queryKey: $qk({
            name: asEthName(label),
          }),
        })
      }

      if (ownerAddress) {
        queryClient.invalidateQueries({
          queryKey: profileReverseNameQuery(ownerAddress).queryKey,
        })
      }
    },
    updateRegistrationStageFromChild: assign({
      maxProgressReached: ({ context, event }) => {
        if (!isRegistrationSnapshotEvent(event)) {
          return context.maxProgressReached
        }

        const value = event.snapshot.value
        const stage = typeof value === 'string' ? value : String(value)
        if (
          !(stage in REGISTRATION_STAGE_PROGRESS) ||
          context.registrationCompleted
        ) {
          return context.maxProgressReached
        }

        return updateMaxProgress(
          context.maxProgressReached,
          stage as RegistrationStage,
        )
      },
    }),
    captureChildSuccess: enqueueActions(({ enqueue, context, event }) => {
      if (!isRegistrationSnapshotEvent(event)) return

      enqueue.assign({
        registrationCompleted: true,
        postRegistrationData: context.postRegistrationData
          ? {
              ...context.postRegistrationData,
              resolverAddress: event.snapshot.context.resolverAddress,
            }
          : context.postRegistrationData,
      })

      if (context.postRegistrationSetup) {
        enqueue.raise({ type: 'registration.completed' })
        return
      }

      enqueue.raise({ type: 'transaction.success' })
    }),
    setRegistrationSuccessStage: assign({
      maxProgressReached: ({ context }) =>
        updateMaxProgress(context.maxProgressReached, 'success'),
    }),
    logPostRegistrationSetupError: ({ event }) => {
      const error = (event as { error?: unknown }).error
      console.warn(
        '[REGISTRATION] Optional post-registration setup step did not complete; the name is already registered:',
        error,
      )
    },
    markPostRegistrationSetupFailed: assign({
      postRegistrationSetupFailed: () => true,
    }),
    setPostRegistrationDecisionStage: assign({
      maxProgressReached: ({ context }) =>
        updateMaxProgress(context.maxProgressReached, 'postRegistrationSetup'),
    }),
    setSyncEthRecordStage: assign({
      maxProgressReached: ({ context }) =>
        updateMaxProgress(context.maxProgressReached, 'syncingEthRecord'),
    }),
    setWaitEthRecordStage: assign({
      maxProgressReached: ({ context }) =>
        updateMaxProgress(
          context.maxProgressReached,
          'waitingForEthRecordSync',
        ),
    }),
    setPrimaryNameStage: assign({
      maxProgressReached: ({ context }) =>
        updateMaxProgress(context.maxProgressReached, 'settingPrimaryName'),
    }),
    storeEthRecordSyncTxId: assign({
      ethRecordSyncTxId: ({ event }) =>
        (event as unknown as { output: string }).output,
    }),
    markEthRecordSynced: assign({
      postRegistrationProgress: ({ context }) => ({
        ...context.postRegistrationProgress,
        ethRecordSynced: true,
      }),
    }),
    markPrimaryNameForwardConfirmed: assign({
      postRegistrationProgress: ({ context }) => ({
        ...context.postRegistrationProgress,
        primaryNameForwardConfirmed: true,
      }),
    }),
  },
})

const startRegistrationAction = machineSetup.createAction(
  enqueueActions(({ enqueue, event }) => {
    if (event.type !== 'registration.start') {
      return enqueue.raise({
        type: '$error',
        error: new Error('registration.start event required'),
      })
    }

    if (!event.account.signer || !event.account.accountAddress) {
      return enqueue.raise({
        type: '$error',
        error: new Error('Account not ready'),
      })
    }

    const ownerAddress =
      event.account.ownerAddress ?? event.account.accountAddress

    const resolverOwnerAddress =
      event.account.ownerAddress ?? event.account.accountAddress

    const approvalSigner: Signer | undefined = event.account.walletClient
      ? { type: 'eoa', walletClient: event.account.walletClient }
      : undefined

    const isHcaRegistration =
      event.account.signer.type === 'rhinestone' &&
      ownerAddress.toLowerCase() !== event.account.accountAddress.toLowerCase()

    if (isHcaRegistration && !approvalSigner) {
      return enqueue.raise({
        type: '$error',
        error: new Error(
          'Cannot register: the wallet that owns this account is unavailable to sign the payment approval. Please reconnect your wallet and try again.',
        ),
      })
    }

    enqueue.assign({
      confirmedData: {
        label: event.label,
        duration: event.duration,
        ownerAddress,
        token: event.token,
        totalPrice: event.totalPrice,
        basePriceNumber: event.basePriceNumber,
        premiumPriceNumber: event.premiumPriceNumber,
      },
      postRegistrationSetup: event.postRegistrationSetup,
      postRegistrationData: {
        label: event.label,
        signer: event.account.signer,
        walletClient: event.account.walletClient,
        accountAddress: event.account.accountAddress,
        ownerAddress,
        publicClient: defaultPublicClient,
        chainId: defaultPublicClient.chain.id,
      },
      postRegistrationProgress: INITIAL_POST_REGISTRATION_PROGRESS,
      registrationCompleted: false,
      postRegistrationSetupFailed: false,
      ethRecordSyncTxId: undefined,
      primaryNameTxId: undefined,
    })

    enqueue(
      machineSetup.sendTo(REGISTRATION_V2_ACTOR_ID, {
        type: 'START_REGISTRATION',
        name: asEthName(event.label),
        duration: event.duration,
        token: event.token,
        price: event.totalPrice,
        signer: event.account.signer,
        approvalSigner,
        accountAddress: event.account.accountAddress,
        ownerAddress,
        resolverOwnerAddress,
        publicClient: defaultPublicClient,
        sponsored:
          import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === undefined
            ? true
            : import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === 'true',
      } satisfies RegistrationEvent),
    )
  }),
)

const submitPrimaryNameForwardAction = machineSetup.createAction(
  enqueueActions(({ enqueue, context }) => {
    if (!context.postRegistrationData?.walletClient) {
      return enqueue.raise({
        type: '$error',
        error: new Error('Post-registration data is incomplete'),
      })
    }

    try {
      // Sent by the owner EOA: the reverse registrars key on msg.sender.
      const txId = submitPrimaryNameForward({
        name: asEthName(context.postRegistrationData.label),
        signer: {
          type: 'eoa',
          walletClient: context.postRegistrationData.walletClient,
        },
        accountAddress: context.postRegistrationData.ownerAddress,
        publicClient: context.postRegistrationData.publicClient,
        chainId: context.postRegistrationData.chainId,
      })

      enqueue.assign({
        primaryNameTxId: txId,
      })
    } catch (error) {
      enqueue.raise({
        type: '$error',
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }),
)

const submitPrimaryNameReverseAction = machineSetup.createAction(
  enqueueActions(({ enqueue, context }) => {
    if (!context.postRegistrationData?.walletClient) {
      return enqueue.raise({
        type: '$error',
        error: new Error('Post-registration data is incomplete'),
      })
    }

    try {
      // Sent by the owner EOA: the reverse registrars key on msg.sender.
      const txId = submitPrimaryNameReverse({
        name: asEthName(context.postRegistrationData.label),
        signer: {
          type: 'eoa',
          walletClient: context.postRegistrationData.walletClient,
        },
        accountAddress: context.postRegistrationData.ownerAddress,
        publicClient: context.postRegistrationData.publicClient,
        chainId: context.postRegistrationData.chainId,
      })

      enqueue.assign({
        primaryNameTxId: txId,
      })
    } catch (error) {
      enqueue.raise({
        type: '$error',
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }),
)

export const registrationV2UiMachine = machineSetup.createMachine({
  id: 'registrationV2Ui',
  invoke: {
    id: REGISTRATION_V2_ACTOR_ID,
    src: 'registrationFlow',
    input: ({ context }) => ({
      chainId: context.chainId,
    }),
    onSnapshot: [
      {
        guard: ({ event: { snapshot } }) => snapshot.matches('success'),
        actions: ['captureChildSuccess'],
      },
      {
        guard: ({ event: { snapshot } }) => snapshot.matches('error'),
        actions: [
          raise(({ event: { snapshot } }) => ({
            type: 'transaction.failed',
            message: snapshot.context.error?.message,
          })),
        ],
      },
      {
        guard: ({ event: { snapshot } }) =>
          !snapshot.matches('success') && !snapshot.matches('error'),
        actions: 'updateRegistrationStageFromChild',
      },
    ],
  },
  initial: 'pricing',
  context: ({ input }) => ({
    chainId: input.chainId,
    duration: getDurationInSecondsFromYears(3),
    selectedToken: undefined,
    lastErrorMessage: undefined,
    postRegistrationProgress: INITIAL_POST_REGISTRATION_PROGRESS,
    registrationCompleted: false,
    postRegistrationSetupFailed: false,
    maxProgressReached: undefined,
  }),
  states: {
    pricing: {
      initial: 'duration',
      states: {
        duration: {
          on: {
            'pricing.duration.set': {
              actions: 'setDuration',
            },
            'pricing.step.next': {
              guard: 'isDurationValid',
              target: 'tokens',
            },
          },
        },
        tokens: {
          on: {
            'pricing.step.previous': {
              target: 'duration',
            },
            'pricing.token.select': {
              actions: 'setToken',
            },
            'pricing.dialog.dismiss': {
              target: 'duration',
            },
            'registration.start': {
              target: '#registrationV2Ui.registering',
              guard: ({ event }) =>
                event.duration >= MIN_REGISTER_DURATION_SECONDS,
              actions: [
                'clearError',
                'clearMaxProgress',
                startRegistrationAction,
              ],
            },
          },
        },
      },
    },
    registering: {
      type: 'parallel',
      states: {
        transaction: {
          initial: 'pendingRegistration',
          states: {
            pendingRegistration: {
              on: {
                'registration.completed': {
                  target: 'postRegistrationDecision',
                },
                'transaction.success': {
                  target: 'success',
                  actions: ['setRegistrationSuccessStage'],
                },
                'transaction.failed': {
                  target: '#registrationV2Ui.failure',
                  actions: ['setError'],
                },
              },
            },
            postRegistrationDecision: {
              entry: ['setPostRegistrationDecisionStage'],
              always: [
                {
                  guard: 'hasEthRecordSyncRemaining',
                  target: 'syncingEthRecord',
                },
                {
                  guard: 'hasPrimaryNameForwardRemaining',
                  target: 'settingPrimaryNameForward',
                },
                {
                  guard: 'hasPrimaryNameReverseRemaining',
                  target: 'settingPrimaryNameReverse',
                },
                {
                  guard: 'primaryNameSetupUnavailable',
                  target: 'success',
                  actions: [
                    'setRegistrationSuccessStage',
                    'markPostRegistrationSetupFailed',
                  ],
                },
                {
                  target: 'success',
                  actions: ['setRegistrationSuccessStage'],
                },
              ],
            },
            syncingEthRecord: {
              entry: ['setSyncEthRecordStage'],
              invoke: {
                src: 'submitEthRecordTransaction',
                input: ({ context }) => {
                  if (!context.postRegistrationData?.resolverAddress) {
                    throw new Error(
                      'Post-registration setup cannot start without registration data',
                    )
                  }

                  return {
                    ...context.postRegistrationData,
                    resolverAddress:
                      context.postRegistrationData.resolverAddress,
                  }
                },
                onDone: {
                  target: 'waitingForEthRecordSync',
                  actions: ['storeEthRecordSyncTxId'],
                },
                onError: {
                  target: 'success',
                  actions: [
                    'setRegistrationSuccessStage',
                    'logPostRegistrationSetupError',
                    'markPostRegistrationSetupFailed',
                  ],
                },
              },
            },
            waitingForEthRecordSync: {
              entry: ['setWaitEthRecordStage'],
              invoke: {
                src: 'waitForKnownTransaction',
                input: ({ context }) => {
                  if (!context.ethRecordSyncTxId) {
                    throw new Error('ETH record sync transaction is missing')
                  }
                  return { txId: context.ethRecordSyncTxId }
                },
                onDone: {
                  target: 'postRegistrationDecision',
                  actions: ['markEthRecordSynced'],
                },
                onError: {
                  target: 'success',
                  actions: [
                    'setRegistrationSuccessStage',
                    'logPostRegistrationSetupError',
                    'markPostRegistrationSetupFailed',
                  ],
                },
              },
            },
            settingPrimaryNameForward: {
              entry: ['setPrimaryNameStage', submitPrimaryNameForwardAction],
              always: {
                guard: 'hasPrimaryNameTxId',
                target: 'waitingForPrimaryNameForward',
              },
            },
            waitingForPrimaryNameForward: {
              entry: ['setPrimaryNameStage'],
              invoke: {
                src: 'waitForKnownTransaction',
                input: ({ context }) => {
                  if (!context.primaryNameTxId) {
                    throw new Error(
                      'Primary name forward transaction is missing',
                    )
                  }
                  return { txId: context.primaryNameTxId }
                },
                onDone: {
                  target: 'postRegistrationDecision',
                  actions: ['markPrimaryNameForwardConfirmed'],
                },
                onError: {
                  target: 'success',
                  actions: [
                    'setRegistrationSuccessStage',
                    'logPostRegistrationSetupError',
                    'markPostRegistrationSetupFailed',
                  ],
                },
              },
            },
            settingPrimaryNameReverse: {
              entry: ['setPrimaryNameStage', submitPrimaryNameReverseAction],
              always: {
                guard: 'hasPrimaryNameTxId',
                target: 'waitingForPrimaryNameReverse',
              },
            },
            waitingForPrimaryNameReverse: {
              entry: ['setPrimaryNameStage'],
              invoke: {
                src: 'waitForKnownTransaction',
                input: ({ context }) => {
                  if (!context.primaryNameTxId) {
                    throw new Error(
                      'Primary name reverse transaction is missing',
                    )
                  }
                  return { txId: context.primaryNameTxId }
                },
                onDone: {
                  target: 'success',
                  actions: ['setRegistrationSuccessStage'],
                },
                onError: {
                  target: 'success',
                  actions: [
                    'setRegistrationSuccessStage',
                    'logPostRegistrationSetupError',
                    'markPostRegistrationSetupFailed',
                  ],
                },
              },
            },
            success: {
              type: 'final',
            },
          },
        },
        notifications: {
          initial: 'settings',
          states: {
            settings: {
              on: {
                'notifications.step.next': {
                  target: 'completed',
                },
              },
            },
            completed: {
              type: 'final',
            },
          },
        },
      },
      onDone: {
        target: 'success',
        actions: ['invalidateNameQueries'],
      },
    },
    success: {},
    failure: {
      on: {
        retry: {
          target: 'registering',
          actions: ['clearError', 'forwardRetry'],
        },
        cancel: {
          target: 'pricing',
          actions: ['clearRegistrationData', 'clearError', 'forwardCancel'],
        },
      },
    },
  },
  on: {
    $error: {
      target: '.failure',
      actions: ['setError'],
    },
    'label.changed': {
      target: '.pricing',
      actions: ['clearRegistrationData', 'clearError', 'forwardCancel'],
    },
  },
})

export type RegistrationV2UiActor = ActorRefFrom<typeof registrationV2UiMachine>

export const getRegistrationV2ChildActor = (
  snapshot: SnapshotFrom<typeof registrationV2UiMachine>,
) =>
  snapshot.children[REGISTRATION_V2_ACTOR_ID] as
    | ActorRefFrom<typeof registrationMachine>
    | undefined
