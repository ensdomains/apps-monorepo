import {
  type RegistrationEvent,
  registrationMachine,
} from '@ens-apps/transaction-manager'
import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import {
  type ActorRefFrom,
  assign,
  enqueueActions,
  raise,
  type SnapshotFrom,
  sendTo,
  setup,
} from 'xstate'
import { MIN_REGISTER_DURATION_SECONDS } from '@/features/register/components/Pricing/utils'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import { publicClient as defaultPublicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'
import { SECONDS_IN_YEAR } from '../utils/time'
import {
  getRegistrationStageProgress,
  type MaxProgressReached,
  REGISTRATION_STAGE_PROGRESS,
  type RegistrationStage,
} from './registration.stages'

export const REGISTRATION_V2_ACTOR_ID = 'registrationActor'

type Context = {
  chainId: number
  /**
   * Duration in seconds
   */
  duration: number
  selectedToken: SUPPORTED_TOKEN | undefined
  lastErrorMessage?: string

  /**
   * Data set after registration has been started as a snapshot
   */
  confirmedData?: {
    label: string
    duration: bigint
    ownerAddress: Address
    token: SUPPORTED_TOKEN
    /** Price in token units */
    totalPrice: bigint

    /** Formatted base price */
    basePriceNumber: number
    /** Formatted premium price */
    premiumPriceNumber: number
  }

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
      /** Price in token units */
      totalPrice: bigint
      account: SmartAccountContextValue

      /** Formatted base price */
      basePriceNumber: number
      /** Formatted premium price */
      premiumPriceNumber: number
    }
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
  },
  guards: {
    isDurationValid: ({ context }) =>
      context.duration >= MIN_REGISTER_DURATION_SECONDS,
  },
  actions: {
    setDuration: assign({
      duration: ({ event }) =>
        event.type === 'pricing.duration.set'
          ? event.duration
          : SECONDS_IN_YEAR,
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
    forwardRetry: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'RETRY' }),
    forwardCancel: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'CANCEL' }),
    clearConfirmedData: assign({
      confirmedData: () => undefined,
    }),

    invalidateNameQueries: ({ context }) => {
      const name = context.confirmedData?.label
      const queryClient = getQueryClient()
      if (!name || !queryClient) {
        return
      }

      queryClient.invalidateQueries({
        queryKey: $qk({
          name: `${name}.eth`,
        }),
      })
    },
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

    // Register the ENS name directly to the EOA on every signer path
    // (eoa, erc4337, rhinestone). The rhinestone smart-session policy is
    // configured to pin `register.owner == EOA` to match (see
    // @ens-apps/rhinestone build-registration-session.ts).
    //
    // Rationale: with the EOA as the on-chain ENS owner, indexer "My names"
    // lookups by EOA work without HCA-equivalence, and registry-level
    // operations (transfer, setResolver, wrap) accept either a direct EOA
    // call or an SCA call that HCAEquivalence unwraps to the same EOA.
    // The fallback to `accountAddress` only triggers for "simple" account
    // types that expose no EOA (we no longer have such a path in v2, but
    // the fallback is kept defensively).
    const ownerAddress =
      event.account.ownerAddress ?? event.account.accountAddress

    // The dedicated resolver's EACL must be granted to the address that the
    // resolver will see at write time. The PermissionedResolver unwraps an
    // ERC-7579 / smart-account caller to its underlying EOA owner before
    // performing the role check, so the EACL grantee must be the EOA — even
    // when the ENS name itself is owned by the SCA (rhinestone session
    // policy). For pure EOA flows this collapses to the same address.
    const resolverOwnerAddress =
      event.account.ownerAddress ?? event.account.accountAddress

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
    })

    enqueue(
      machineSetup.sendTo(REGISTRATION_V2_ACTOR_ID, {
        type: 'START_REGISTRATION',
        name: event.label,
        duration: event.duration,
        token: event.token,
        price: event.totalPrice,
        signer: event.account.signer,
        accountAddress: event.account.accountAddress,
        ownerAddress,
        resolverOwnerAddress,
        publicClient: defaultPublicClient,
        // The canonical v2 ETHRegistrar handles both fork and prod deployments
        // and has the current MockUSDC/MockDAI in its payment-token whitelist.
        // FastTestETHRegistrar from the previous fork still exists on the new
        // fork but with a stale whitelist, so leave it disabled.
        useFastRegistrar: false,
        sponsored:
          import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === undefined
            ? true
            : import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === 'true',
      } satisfies RegistrationEvent),
    )
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
        actions: [
          raise({
            type: 'transaction.success',
          }),
        ],
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
        actions: assign({
          maxProgressReached: ({ context, event }) => {
            const value = event.snapshot.value
            const stage = typeof value === 'string' ? value : String(value)
            if (!(stage in REGISTRATION_STAGE_PROGRESS)) {
              return context.maxProgressReached
            }
            const progress = getRegistrationStageProgress(stage)
            const current = context.maxProgressReached
            if (current && progress <= current.progress) return current
            return { stage: stage as RegistrationStage, progress }
          },
        }),
      },
    ],
  },
  initial: 'pricing',
  context: ({ input }) => ({
    chainId: input.chainId,
    duration: SECONDS_IN_YEAR * 3,
    selectedToken: undefined,
    lastErrorMessage: undefined,
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
          initial: 'pending',
          states: {
            pending: {
              on: {
                'transaction.success': {
                  target: 'success',
                },
                'transaction.failed': {
                  target: '#registrationV2Ui.failure',
                  actions: ['setError'],
                },
              },
              // TODO: Check if TX already done and if so, skip to success
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
          actions: ['clearConfirmedData', 'clearError', 'forwardCancel'],
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
      actions: ['clearConfirmedData', 'clearError', 'forwardCancel'],
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
