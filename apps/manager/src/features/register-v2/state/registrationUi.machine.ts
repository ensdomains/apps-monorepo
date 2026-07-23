import {
  type RegistrationEvent,
  registrationMachine,
  type Signer,
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
  getVoucherFulfilmentPhaseProgress,
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

  /**
   * Latest backend fulfilment phase for the voucher (self-pay) path
   * (pending|paid|committing|committed|registering|registered). Reported by
   * PaymentCard's order-status poll; drives progress WITHIN the long
   * `fulfillingRegistration` stage and phase-specific status copy.
   */
  voucherPhase?: string
}

type Events =
  | { type: 'pricing.step.next' }
  | { type: 'pricing.step.previous' }
  | { type: 'pricing.dialog.dismiss' }
  | { type: 'pricing.duration.set'; duration: number }
  | { type: 'pricing.token.select'; token: SUPPORTED_TOKEN | undefined }
  | { type: 'registration.voucherPhase'; phase: string }
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

      /** Voucher order data (self-pay path) */
      voucherOrder?: {
        orderId: string
        commitment: `0x${string}`
        paymentToken: Address
        paymentAmount: bigint
        /** Server-quoted fulfilment-gas component (from the order quote). */
        gasFee: bigint
        walletClient: import('viem').WalletClient
        /** Auth-aware order status poll (JWT-gated endpoint). */
        pollOrderStatus: () => Promise<{
          status: string
          error?: string | null
        }>
        /** Settle nudge: receives the confirmed mint tx hash (post-mint). */
        triggerFulfilment: (mintTxHash: `0x${string}`) => void
      }
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
      voucherPhase: () => undefined,
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
    // (eoa, rhinestone). The rhinestone smart-session policy is
    // configured to pin `register.owner == EOA` to match (see
    // @ens-apps/smart-account providers/rhinestone/registration-policy.ts).
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

    // The ENS registrar pulls the payment token from the name owner (the EOA),
    // so the allowance must be authorized by the EOA. With EIP-2612 the EOA
    // does this with an OFF-CHAIN permit signature (gasless) — the HCA then
    // carries that permit inside the sponsored register bundle, so the EOA
    // never sends a transaction or needs ETH. Hand the registration machine a
    // dedicated EOA signer (the owner's wallet client) to produce that permit
    // signature; commit/deploy/register stay on the sponsored rhinestone
    // signer. For pure-EOA flows this is the same wallet (and that path keeps
    // using a plain on-chain `approve`).
    //
    // `account.walletClient` is the wagmi wallet client for the owner EOA. Para
    // bridges embedded wallets into wagmi via its connector, so this is
    // populated for both external and embedded wallets, and the connector's
    // EIP-1193 provider signs the permit through Para. It can be momentarily
    // null during a wallet/connector desync — see the fail-fast guard below.
    const approvalSigner: Signer | undefined = event.account.walletClient
      ? { type: 'eoa', walletClient: event.account.walletClient }
      : undefined

    // HCA flows register the name to the EOA owner, and the registrar pulls the
    // payment from that owner — so the permit MUST be EOA-signed. Without an
    // `approvalSigner` there's no EOA wallet to produce the permit signature, so
    // payment can't be authorized. Fail fast with an actionable message (e.g.
    // when a Para embedded wallet is mid-reconnect and exposes no client)
    // instead of entering the flow and stalling at the permit step.
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
    })

    enqueue(
      machineSetup.sendTo(REGISTRATION_V2_ACTOR_ID, {
        type: 'START_REGISTRATION',
        name: event.label,
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
        voucherOrder: event.voucherOrder,
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
    voucherPhase: undefined,
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
          },
        },
      },
      // Handled at the `pricing` parent level so it works from BOTH substates:
      // the token picker (`tokens`) sends it for the HCA/Rhinestone flow, and
      // the PaymentCard voucher self-pay path sends it directly from
      // `duration` (it skips token selection — the voucher is always USDC).
      on: {
        'registration.start': {
          target: '#registrationV2Ui.registering',
          guard: ({ event }) => event.duration >= MIN_REGISTER_DURATION_SECONDS,
          actions: ['clearError', 'clearMaxProgress', startRegistrationAction],
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
    // Fulfilment phase from the voucher order-status poll (PaymentCard). Maps
    // real backend phases onto the fulfilment band of the progress bar —
    // without this the bar would sit at a single static value for the whole
    // ~2-3 min fulfilment (commit txs + cooldown + register). Same monotonic
    // clamp as the stage-based updates: a stale/out-of-order poll response
    // can never move the bar backwards.
    'registration.voucherPhase': {
      actions: assign({
        voucherPhase: ({ event }) => event.phase,
        maxProgressReached: ({ context, event }) => {
          const progress = getVoucherFulfilmentPhaseProgress(event.phase)
          if (progress === undefined) return context.maxProgressReached
          const current = context.maxProgressReached
          if (current && progress <= current.progress) return current
          return { stage: 'fulfillingRegistration', progress }
        },
      }),
    },
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
