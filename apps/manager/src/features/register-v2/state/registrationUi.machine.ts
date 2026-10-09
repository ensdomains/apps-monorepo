import type { HcaSessionEnablePayload } from '@ens-apps/smart-account'
import {
  type PersistedRegistrationRecord,
  type RegistrationEvent,
  registrationMachine,
  type Signer,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
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
import { getCanonicalPrimaryName } from '@/features/profile/service/profileName'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { MIN_REGISTER_DURATION_SECONDS } from '@/features/shared/registration/pricing'
import { buildIntentStatusFetcher } from '@/lib/smart-account/rhinestone'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import type { SUPPORTED_TOKEN } from '@/lib/tokens'
import { publicClient as defaultPublicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'
import {
  hasStaleAddrReverse,
  submitClearAddrReverse,
  submitPrimaryNameForward,
  submitPrimaryNameReverse,
} from '../../profile/service/setPrimaryName'
import {
  acquireRegistrationLock,
  getBlockingRegistration,
  releaseRegistrationLock,
} from '../service/registrationLock'
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
  /**
   * Set once the `addr.reverse` cleanup has run to completion — including the
   * case where nothing needed clearing. Guards on this so the step is
   * attempted exactly once per registration.
   */
  addrReverseClearAttempted: boolean
}

/**
 * What the user confirmed at the pricing step, carried through the registering
 * screen. Named because the resume path has to persist and restore it — the
 * price breakdown is display state the machine context cannot reproduce.
 */
export type RegistrationConfirmedData = {
  label: string
  duration: bigint
  ownerAddress: Address
  token: SUPPORTED_TOKEN
  totalPrice: bigint
  basePriceNumber: number
  premiumPriceNumber: number
}

type Context = {
  chainId: number
  duration: number
  selectedToken: SUPPORTED_TOKEN | undefined
  lastErrorMessage?: string
  /**
   * The registration failed because another address registered the name first.
   * Nothing to retry — the failure screen offers only a way back.
   */
  nameUnavailable: boolean
  /**
   * A start or resume was refused because the wallet is registering elsewhere.
   * Nothing ran and nothing failed, so the screen says so instead of offering
   * a retry of a registration that never began. Tracked apart from the name
   * holding the wallet: that lookup can come back empty if the other tab
   * finishes in between, and the refusal still happened.
   */
  isWalletBusy: boolean
  /** A start or resume the wallet lock refused; `retry` re-raises it once free. */
  pendingStart?: Extract<
    Events,
    { type: 'registration.start' | 'registration.resume' }
  >
  confirmedData?: RegistrationConfirmedData
  postRegistrationSetup?: RegistrationPostRegistrationSetup
  postRegistrationData?: PostRegistrationData
  postRegistrationProgress: PostRegistrationProgress
  registrationCompleted: boolean
  postRegistrationSetupFailed: boolean
  ethRecordSyncTxId?: string
  primaryNameTxId?: string
  /**
   * The primary name the HCA reveal batch claimed on `default.reverse`, when
   * the user opted in. Its presence is what marks the registration as needing
   * the `addr.reverse` cleanup pass; the EOA path leaves it undefined and
   * handles its own reverse leg.
   */
  hcaPrimaryName?: string
  addrReverseClearTxId?: string
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
      /**
       * Standalone-HCA session-enable payload, pre-resolved by the caller
       * (`account.getSessionEnablePayload()`). Absent on the pure-EOA path.
       */
      hcaSessionEnable?: HcaSessionEnablePayload
      basePriceNumber: number
      premiumPriceNumber: number
      postRegistrationSetup?: RegistrationPostRegistrationSetup
      /**
       * Standalone-HCA: the USDC (6dp) wallet debit the confirm screen showed.
       * Passed straight to the registration machine, which refuses to request a
       * funding-permit signature for materially more than this. Absent when the
       * budget quote failed and only the rent was displayed.
       */
      displayedWalletDebit?: bigint
    }
  | {
      /**
       * Re-enter a registration that was interrupted by a reload.
       *
       * Carries what was persisted plus a freshly rebuilt account, and is
       * accepted from ANY state — a reload lands the UI machine in `pricing`,
       * which is where the resume has to be caught.
       */
      type: 'registration.resume'
      label: string
      confirmedData: RegistrationConfirmedData
      /** The machine-context half, as restored by the preflight. */
      record: PersistedRegistrationRecord
      postRegistrationSetup?: RegistrationPostRegistrationSetup
      account: SmartAccountContextValue
      hcaSessionEnable?: HcaSessionEnablePayload
    }
  | {
      /**
       * A different wallet connected while a run is live. Back to pricing,
       * with the run suspended rather than cancelled so its owner can resume it.
       */
      type: 'registration.suspend'
    }
  | { type: 'registration.completed' }
  | { type: 'notifications.step.next' }
  | { type: 'transaction.success' }
  | { type: 'transaction.failed'; message?: string; nameUnavailable?: boolean }
  | { type: 'retry' }
  | { type: 'cancel' }
  | { type: 'label.changed' }
  | { type: '$error'; error: Error }
  | { type: '$walletBusy'; blockingName: string | null }

type Input = {
  chainId: number
}

const INITIAL_POST_REGISTRATION_PROGRESS: PostRegistrationProgress = {
  ethRecordSynced: false,
  primaryNameForwardConfirmed: false,
  addrReverseClearAttempted: false,
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

// Require a bound account that matches the owner: an account-less client
// (possible mid-reconnect) gives no way to verify the wallet controls the
// owner address, so treat it as unavailable rather than submitting blind.
const hasOwnerWallet = (context: Context) => {
  if (!context.postRegistrationData) return false

  const { walletClient, ownerAddress } = context.postRegistrationData

  return (
    !!walletClient?.account &&
    isAddressEqual(walletClient.account.address, ownerAddress)
  )
}

// EOA fallback only: the HCA path sets the primary name inside the reveal
// batch via the reverse-registrar adapter, so this flow never runs there.
const canSetPrimaryName = (context: Context) =>
  shouldSetPrimaryName(context) && hasOwnerWallet(context)

// HCA path only. The reveal batch claims `default.reverse`, but a leftover
// `addr.reverse` entry shadows it — so the claim silently does nothing until
// that entry is cleared, which only the owner EOA can do (see
// `submitClearAddrReverse`).
const hasAddrReverseClearRemaining = (context: Context) =>
  !!context.hcaPrimaryName &&
  !context.postRegistrationProgress.addrReverseClearAttempted &&
  hasOwnerWallet(context)

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
    submitPrimaryNameTransaction: fromPromise(
      async ({
        input,
      }: {
        input: {
          data: PostRegistrationData | undefined
          leg: 'forward' | 'reverse'
        }
      }) => {
        if (!input.data?.walletClient) {
          throw new Error('Post-registration data is incomplete')
        }
        const { data } = input
        const submit =
          input.leg === 'forward'
            ? submitPrimaryNameForward
            : submitPrimaryNameReverse
        return submit({
          name: asEthName(data.label),
          signer: { type: 'eoa', walletClient: input.data.walletClient },
          accountAddress: data.ownerAddress,
          publicClient: data.publicClient,
          chainId: data.chainId,
        })
      },
    ),
    waitForKnownTransaction: fromPromise(
      async ({ input }: { input: { txId: string } }) =>
        waitForTransaction(input.txId),
    ),
    // Reads first so the wallet is only prompted when there is genuinely a
    // shadowing entry to clear — most registrations need nothing here, and an
    // unnecessary prompt right after a prompt-free registration is worse than
    // the stale record it would avoid.
    submitAddrReverseClear: fromPromise(
      async ({
        input,
      }: {
        input: {
          ownerAddress: Address
          walletClient: WalletClient
          publicClient: PublicClient
          chainId: number
        }
      }): Promise<{ txId?: string }> => {
        const stale = await hasStaleAddrReverse({
          publicClient: input.publicClient,
          ownerAddress: input.ownerAddress,
        })

        if (!stale) return {}

        return {
          txId: submitClearAddrReverse({
            signer: { type: 'eoa', walletClient: input.walletClient },
            ownerAddress: input.ownerAddress,
            publicClient: input.publicClient,
            chainId: input.chainId,
          }),
        }
      },
    ),
  },
  guards: {
    hasPendingStart: ({ context }) => context.pendingStart !== undefined,
    isWalletRegisteringAnotherName: ({ context }) =>
      blockingRegistrationFor(context) !== null,
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
    hasAddrReverseClearRemaining: ({ context }) =>
      hasAddrReverseClearRemaining(context),
    // Reads the actor's output, not context: guards run before the
    // transition's actions, so `addrReverseClearTxId` is still unset here.
    addrReverseClearSubmitted: ({ event }) =>
      !!(event as unknown as { output?: { txId?: string } }).output?.txId,
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
      nameUnavailable: () => false,
      isWalletBusy: () => false,
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
      nameUnavailable: ({ event }) =>
        match(event)
          .with(
            { type: 'transaction.failed' },
            ({ nameUnavailable }) => nameUnavailable === true,
          )
          .otherwise(() => false),
      // A real failure replaces a refusal: something did run this time.
      isWalletBusy: () => false,
    }),
    setInvokeError: assign({
      lastErrorMessage: ({ event }) => {
        const error = (event as { error?: unknown }).error
        return error instanceof Error ? error.message : String(error)
      },
    }),
    forwardRetry: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'RETRY' }),
    forwardCancel: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'CANCEL' }),
    forwardSuspend: sendTo(REGISTRATION_V2_ACTOR_ID, { type: 'SUSPEND' }),
    // The child never received START_REGISTRATION for a refused start, so a
    // RETRY would be dropped in its idle state. Re-run the start instead.
    raisePendingStart: enqueueActions(({ enqueue, context }) => {
      if (context.pendingStart) enqueue.raise(context.pendingStart)
    }),
    setWalletBusy: assign({
      lastErrorMessage: ({ event }) =>
        match(event)
          .with({ type: '$walletBusy' }, ({ blockingName }) =>
            registrationLockMessage(blockingName),
          )
          .otherwise(() => undefined),
      isWalletBusy: () => true,
      nameUnavailable: () => false,
    }),
    setRegistrationLockError: assign({
      lastErrorMessage: ({ context }) =>
        registrationLockMessage(blockingRegistrationFor(context)),
      isWalletBusy: () => true,
    }),
    acquireRegistrationLock: ({ context }) => {
      const confirmed = context.confirmedData
      if (!confirmed) return

      acquireRegistrationLock(
        confirmed.ownerAddress,
        asEthName(confirmed.label),
      )
    },
    releaseRegistrationLock: ({ context }) => {
      const confirmed = context.confirmedData
      if (!confirmed) return

      releaseRegistrationLock(confirmed.ownerAddress)
    },
    clearRegistrationData: assign({
      pendingStart: () => undefined,
      confirmedData: () => undefined,
      postRegistrationSetup: () => undefined,
      postRegistrationData: () => undefined,
      postRegistrationProgress: () => INITIAL_POST_REGISTRATION_PROGRESS,
      registrationCompleted: () => false,
      postRegistrationSetupFailed: () => false,
      ethRecordSyncTxId: () => undefined,
      primaryNameTxId: () => undefined,
      hcaPrimaryName: () => undefined,
      addrReverseClearTxId: () => undefined,
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

      const confirmed = context.confirmedData
      if (confirmed) {
        releaseRegistrationLock(confirmed.ownerAddress)
      }

      enqueue.assign({
        registrationCompleted: true,
        postRegistrationData: context.postRegistrationData
          ? {
              ...context.postRegistrationData,
              resolverAddress: event.snapshot.context.resolverAddress,
            }
          : context.postRegistrationData,
      })

      // `hcaPrimaryName` counts here too: the HCA path carries no
      // `postRegistrationSetup`, but it still owes the `addr.reverse` cleanup
      // pass, and skipping straight to success would never run it.
      if (context.postRegistrationSetup || context.hcaPrimaryName) {
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
    storePrimaryNameTxId: assign({
      primaryNameTxId: ({ event }) =>
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
    storeAddrReverseClearTxId: assign({
      addrReverseClearTxId: ({ event }) =>
        (event as unknown as { output: { txId?: string } }).output.txId,
    }),
    markAddrReverseClearAttempted: assign({
      postRegistrationProgress: ({ context }) => ({
        ...context.postRegistrationProgress,
        addrReverseClearAttempted: true,
      }),
    }),
  },
})

/** Names the registration holding this wallet, so the user knows what to finish. */
/** The name holding this run's wallet, if any. */
const blockingRegistrationFor = (context: Context): string | null => {
  const confirmed = context.confirmedData
  if (!confirmed) return null

  return getBlockingRegistration(
    confirmed.ownerAddress,
    asEthName(confirmed.label),
  )
}

const registrationLockMessage = (blockingName: string | null): string =>
  `${blockingName ?? 'Another name'} is already being registered with this wallet, possibly in another tab. One registration runs at a time, so this one has not started.`

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

    // A primary claim must use exactly the label passed to registration.
    // Reject instead of registering one identity and claiming its normalized twin.
    if (
      event.postRegistrationSetup?.primaryName?.enabled &&
      getCanonicalPrimaryName(asEthName(event.label)) !== asEthName(event.label)
    ) {
      return enqueue.raise({
        type: '$error',
        error: new Error(
          'Cannot set primary name - the name is not ENSIP-15 canonical.',
        ),
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

    // The HCA reveal batch sets the ETH addr record itself and, when opted
    // in, the primary name through the reverse-registrar adapter, so the EOA
    // post-registration setup is skipped entirely on that path.
    const bundlePrimaryName =
      isHcaRegistration && event.postRegistrationSetup?.primaryName?.enabled
        ? asEthName(event.label)
        : undefined

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
      postRegistrationSetup: isHcaRegistration
        ? undefined
        : event.postRegistrationSetup,
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
      hcaPrimaryName: bundlePrimaryName,
      addrReverseClearTxId: undefined,
    })

    // One registration at a time per wallet, across tabs. The commit batch
    // funds the HCA with an EIP-2612 permit whose nonce is sequential per
    // wallet, so a concurrent run reverts `TransferFromFailed()` and never
    // records its commitment. Claimed after the assign above: `confirmedData`
    // is what `retry` reads to re-run this check.
    if (!acquireRegistrationLock(ownerAddress, asEthName(event.label))) {
      enqueue.assign({ pendingStart: event })
      return enqueue.raise({
        type: '$walletBusy',
        blockingName: getBlockingRegistration(
          ownerAddress,
          asEthName(event.label),
        ),
      })
    }

    enqueue.assign({ pendingStart: undefined })

    enqueue(
      machineSetup.sendTo(REGISTRATION_V2_ACTOR_ID, {
        type: 'START_REGISTRATION',
        name: asEthName(event.label),
        duration: event.duration,
        token: event.token,
        price: event.totalPrice,
        signer: event.account.signer,
        // Funding permit signer (wallet → HCA budget) on the HCA path.
        approvalSigner,
        accountAddress: event.account.accountAddress,
        ownerAddress,
        resolverOwnerAddress,
        publicClient: defaultPublicClient,
        // Standalone-HCA session-enable payload (omitted once enabled).
        hcaSessionEnable: event.hcaSessionEnable,
        primaryName: bundlePrimaryName,
        // Consent bound on the funding permit: what the confirm screen showed.
        displayedWalletDebit: event.displayedWalletDebit,
        // `INTENT_SUBMITTED` captures the reveal intent id on live runs too,
        // so a dead intent fails verification in one orchestrator read instead
        // of sitting out the full grace poll before the retry screen.
        fetchIntentStatus: buildIntentStatusFetcher(),
        // A leg whose quoted fee outgrows the session asks for a new one.
        reauthorizeSession: event.account.reauthorizeSession,
      } satisfies RegistrationEvent),
    )
  }),
)

/**
 * Resume counterpart to `startRegistrationAction`.
 *
 * The two differ in exactly one way that matters: this one hands the child a
 * `RESUME` (restored context + fresh deps, routed to a read-before-write state)
 * rather than a `START_REGISTRATION`, so nothing already in flight is
 * re-submitted. Everything else — the account checks, the approval signer, the
 * post-registration bookkeeping — is deliberately identical, because a resumed
 * run has to behave like the run it is continuing.
 */
const resumeRegistrationAction = machineSetup.createAction(
  enqueueActions(({ enqueue, event }) => {
    if (event.type !== 'registration.resume') {
      return enqueue.raise({
        type: '$error',
        error: new Error('registration.resume event required'),
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
          'Cannot resume: the wallet that owns this account is unavailable to sign the payment approval. Please reconnect your wallet and try again.',
        ),
      })
    }

    enqueue.assign({
      confirmedData: event.confirmedData,
      postRegistrationSetup: isHcaRegistration
        ? undefined
        : event.postRegistrationSetup,
      postRegistrationData: {
        label: event.label,
        signer: event.account.signer,
        walletClient: event.account.walletClient,
        accountAddress: event.account.accountAddress,
        ownerAddress,
        publicClient: defaultPublicClient,
        chainId: defaultPublicClient.chain.id,
        // Restoring this lets the post-registration eth-record sync target the
        // resolver the original run deployed, instead of deploying a second one.
        resolverAddress: event.record.context.resolverAddress,
      },
      postRegistrationProgress: INITIAL_POST_REGISTRATION_PROGRESS,
      registrationCompleted: false,
      postRegistrationSetupFailed: false,
      ethRecordSyncTxId: undefined,
      primaryNameTxId: undefined,
      // The reveal batch bundles the primary name, so this is whatever the
      // ORIGINAL run committed to — re-deriving it from current UI state could
      // disagree with the batch that is already in flight.
      hcaPrimaryName: event.record.context.primaryName,
      addrReverseClearTxId: undefined,
    })

    // A resumed run has no claim on the wallet yet (a reload dropped this
    // tab's), and it is about to continue a commit on that wallet's nonce.
    if (!acquireRegistrationLock(ownerAddress, asEthName(event.label))) {
      enqueue.assign({ pendingStart: event })
      return enqueue.raise({
        type: '$walletBusy',
        blockingName: getBlockingRegistration(
          ownerAddress,
          asEthName(event.label),
        ),
      })
    }

    enqueue.assign({ pendingStart: undefined })

    enqueue(
      machineSetup.sendTo(REGISTRATION_V2_ACTOR_ID, {
        type: 'RESUME',
        stage: event.record.stage,
        context: {
          ...event.record.context,
          // The preflight re-quoted; the stored price is from before the user
          // left and the temporary premium has decayed since.
          tokenPrice: event.confirmedData.totalPrice,
        },
        deps: {
          signer: event.account.signer,
          approvalSigner,
          publicClient: defaultPublicClient,
          hcaSessionEnable: event.hcaSessionEnable,
          // Lets a resumed verification ask the orchestrator whether the
          // persisted reveal intent is still filling or dead, instead of
          // sitting out the full grace poll before showing the retry screen.
          fetchIntentStatus: buildIntentStatusFetcher(),
          reauthorizeSession: event.account.reauthorizeSession,
        },
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
        actions: ['captureChildSuccess'],
      },
      {
        guard: ({ event: { snapshot } }) => snapshot.matches('error'),
        actions: [
          raise(({ event: { snapshot } }) => ({
            type: 'transaction.failed',
            message: snapshot.context.error?.message,
            // Lost a same-name race: the child refuses RETRY, so the failure
            // screen must not offer one either.
            nameUnavailable: snapshot.context.nameUnavailable === true,
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
    nameUnavailable: false,
    isWalletBusy: false,
    postRegistrationProgress: INITIAL_POST_REGISTRATION_PROGRESS,
    registrationCompleted: false,
    postRegistrationSetupFailed: false,
    maxProgressReached: undefined,
  }),
  states: {
    pricing: {
      initial: 'duration',
      // On `pricing` (all substates), NOT the root: a reload lands in
      // `pricing.duration`, which is where a resume arrives. Scoping it here
      // is the guard — a resume that dispatches late (e.g. delayed behind a
      // wallet prompt the user ignored while starting a fresh registration)
      // is dropped instead of re-entering `registering`, resetting its
      // parallel regions and clobbering the live run's confirmedData. The
      // child ignores RESUME outside idle for the same reason.
      on: {
        'registration.resume': {
          target: '#registrationV2Ui.registering',
          actions: ['clearError', 'clearMaxProgress', resumeRegistrationAction],
        },
      },
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
      on: {
        // Only until the name is registered: after that the run has nothing
        // left to lose, and post-registration setup finishes on its own.
        'registration.suspend': {
          guard: ({ context }) => !context.registrationCompleted,
          target: '#registrationV2Ui.pricing',
          actions: [
            'clearRegistrationData',
            'clearError',
            'clearMaxProgress',
            'forwardSuspend',
          ],
        },
      },
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
                  guard: 'hasAddrReverseClearRemaining',
                  target: 'clearingStaleAddrReverse',
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
            clearingStaleAddrReverse: {
              entry: ['setPrimaryNameStage'],
              invoke: {
                src: 'submitAddrReverseClear',
                input: ({ context }) => {
                  const data = context.postRegistrationData
                  if (!data?.walletClient) {
                    throw new Error(
                      'Cannot clear addr.reverse without the owner wallet',
                    )
                  }

                  return {
                    ownerAddress: data.ownerAddress,
                    walletClient: data.walletClient,
                    publicClient: data.publicClient,
                    chainId: data.chainId,
                  }
                },
                // Mark attempted on both branches: the no-op case is a
                // completed cleanup, and re-entering the decision state
                // without it would loop.
                onDone: [
                  {
                    guard: 'addrReverseClearSubmitted',
                    target: 'waitingForAddrReverseClear',
                    actions: [
                      'storeAddrReverseClearTxId',
                      'markAddrReverseClearAttempted',
                    ],
                  },
                  {
                    target: 'postRegistrationDecision',
                    actions: ['markAddrReverseClearAttempted'],
                  },
                ],
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
            waitingForAddrReverseClear: {
              entry: ['setPrimaryNameStage'],
              invoke: {
                src: 'waitForKnownTransaction',
                input: ({ context }) => {
                  if (!context.addrReverseClearTxId) {
                    throw new Error('addr.reverse clear transaction is missing')
                  }
                  return { txId: context.addrReverseClearTxId }
                },
                onDone: {
                  target: 'postRegistrationDecision',
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
              entry: ['setPrimaryNameStage'],
              invoke: {
                src: 'submitPrimaryNameTransaction',
                input: ({ context }) => ({
                  data: context.postRegistrationData,
                  leg: 'forward',
                }),
                onDone: {
                  target: 'waitingForPrimaryNameForward',
                  actions: ['storePrimaryNameTxId'],
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
              entry: ['setPrimaryNameStage'],
              invoke: {
                src: 'submitPrimaryNameTransaction',
                input: ({ context }) => ({
                  data: context.postRegistrationData,
                  leg: 'reverse',
                }),
                onDone: {
                  target: 'waitingForPrimaryNameReverse',
                  actions: ['storePrimaryNameTxId'],
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
        retry: [
          {
            // Retry re-enters `registering` directly, so it needs the same
            // wallet guard the initial start has.
            guard: 'isWalletRegisteringAnotherName',
            actions: 'setRegistrationLockError',
          },
          {
            guard: 'hasPendingStart',
            actions: ['clearError', 'raisePendingStart'],
          },
          {
            // Retrying a name someone else now owns would park the UI back on
            // the pending screen while the child refuses the RETRY it forwards.
            guard: ({ context }) => !context.nameUnavailable,
            target: 'registering',
            actions: ['clearError', 'acquireRegistrationLock', 'forwardRetry'],
          },
        ],
        'registration.start': {
          target: 'registering',
          guard: ({ event }) => event.duration >= MIN_REGISTER_DURATION_SECONDS,
          actions: ['clearError', 'clearMaxProgress', startRegistrationAction],
        },
        'registration.resume': {
          target: 'registering',
          actions: ['clearError', 'clearMaxProgress', resumeRegistrationAction],
        },
        cancel: {
          target: 'pricing',
          actions: [
            'releaseRegistrationLock',
            'clearRegistrationData',
            'clearError',
            'forwardCancel',
          ],
        },
        // "Try Again" would carry on with the previous wallet's signer.
        'registration.suspend': {
          target: 'pricing',
          actions: ['clearRegistrationData', 'clearError', 'forwardSuspend'],
        },
      },
    },
  },
  on: {
    $error: {
      target: '.failure',
      actions: ['setError'],
    },
    // Not a failure: the wallet is busy elsewhere and this run never started.
    $walletBusy: {
      target: '.failure',
      actions: ['setWalletBusy'],
    },
    'label.changed': {
      target: '.pricing',
      actions: [
        'releaseRegistrationLock',
        'clearRegistrationData',
        'clearError',
        'forwardCancel',
      ],
    },
  },
})

export type RegistrationV2UiActor = ActorRefFrom<typeof registrationV2UiMachine>

/**
 * The owner of the run the machine is driving, while `registration.suspend`
 * can still stop it: registering until the name is registered, or failed.
 */
export const getSuspendableRunOwner = (
  snapshot: SnapshotFrom<typeof registrationV2UiMachine>,
): Address | undefined => {
  const suspendable =
    (snapshot.matches('registering') &&
      !snapshot.context.registrationCompleted) ||
    snapshot.matches('failure')

  return suspendable ? snapshot.context.confirmedData?.ownerAddress : undefined
}

export const getRegistrationV2ChildActor = (
  snapshot: SnapshotFrom<typeof registrationV2UiMachine>,
) =>
  snapshot.children[REGISTRATION_V2_ACTOR_ID] as
    | ActorRefFrom<typeof registrationMachine>
    | undefined
