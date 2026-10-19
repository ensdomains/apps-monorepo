import type { HcaSessionEnablePayload } from '@ens-apps/smart-account'
import {
  type L2FundingSource,
  type PersistedRegistrationRecord,
  type RegistrationEvent,
  registrationMachine,
  type Signer,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { isUserRejectionError } from '@ens-apps/transaction-manager/errors/transaction.errors'
import { getResumeTarget } from '@ens-apps/transaction-manager/machines/registration/registration.persistence'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { match, P } from 'ts-pattern'
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
  submitPrimaryNameForward,
  submitPrimaryNameReverse,
} from '../../profile/service/setPrimaryName'
import { getL2FundingSource } from '../service/l2FundingSource'
import {
  getRegistrationFailureMessage,
  isNameNotAvailableError,
  isNameTakenByOther,
} from '../service/registrationFailure'
import {
  acquireRegistrationLock,
  getBlockingRegistration,
  releaseRegistrationLock,
} from '../service/registrationLock'
import {
  clearStoredRegistrationIfUnchanged,
  type StoredRegistrationKey,
} from '../service/registrationPersistence'
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
type ApprovalOutcome = 'none' | 'failed' | 'rejected'

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
  /** The L2 row picked to pay from; the registration still pays in `selectedToken`. */
  fundingSourceChainId?: number
  lastErrorMessage?: string
  approvalOutcome: ApprovalOutcome
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
  /**
   * Set while the failure screen shows a run that failed before this page
   * loaded: the stored write it was restored from. Its child machine never
   * resumed, so `retry` and `cancel` have nothing to forward to: Try Again
   * resumes it through `useRegistrationResume`, which owns the session gate,
   * and Back to Quote discards that write, if it is still the stored one.
   * Cleared only once the child takes the run, so a retry the wallet lock or
   * an unready account refuses lands back here with the screen still
   * restored.
   */
  restoredRun?: StoredRegistrationKey
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
  maxProgressReached?: MaxProgressReached
}

type Events =
  | { type: 'pricing.step.next' }
  | { type: 'pricing.step.previous' }
  | { type: 'pricing.dialog.dismiss' }
  | { type: 'pricing.duration.set'; duration: number }
  | { type: 'pricing.token.select'; token: SUPPORTED_TOKEN | undefined }
  | { type: 'pricing.fundingSource.select'; chainId: number }
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
      /** Standalone-HCA: the L2 whose USDC pays, instead of the wallet's here. */
      l2FundingChainId?: number
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
       * Show a stored run that failed with its commitment on-chain, without
       * resuming it. Re-entering it on load would replay the failure, or put a
       * wallet prompt up before the user asked for one; this waits for Try
       * Again instead, which continues from the same commitment.
       */
      type: 'registration.failure.restore'
      confirmedData: RegistrationConfirmedData
      /** The stored write the run was restored from. */
      run: StoredRegistrationKey
    }
  | {
      /**
       * A different wallet connected while a run is live. Back to pricing,
       * with the run suspended rather than cancelled so its owner can resume it.
       */
      type: 'registration.suspend'
    }
  | { type: 'registration.completed' }
  | { type: 'registration.approved' }
  | { type: 'notifications.step.next' }
  | { type: 'transaction.success' }
  | {
      type: 'transaction.failed'
      message?: string
      nameUnavailable?: boolean
      approvalOutcome?: ApprovalOutcome
      hasCommitment?: boolean
    }
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
    checkNameTakenByOther: fromPromise(
      ({
        input,
      }: {
        input: Parameters<typeof isNameTakenByOther>[0] | undefined
      }) => (input ? isNameTakenByOther(input) : Promise.resolve(false)),
    ),
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
  },
  guards: {
    isRestoredFailure: ({ context }) => context.restoredRun !== undefined,
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
    restorePricing: assign(({ event }) => {
      if (event.type !== 'registration.resume') return {}
      return {
        duration: Number(event.confirmedData.duration),
        selectedToken: event.confirmedData.token,
        confirmedData: event.confirmedData,
        postRegistrationSetup: event.postRegistrationSetup,
        hcaPrimaryName: event.record.context.primaryName,
      }
    }),
    setFundingSource: assign({
      fundingSourceChainId: ({ event, context }) =>
        event.type === 'pricing.fundingSource.select'
          ? event.chainId
          : context.fundingSourceChainId,
      // Every row ends up paying the registration in wallet USDC.
      selectedToken: () => 'USDC' as const,
    }),
    clearFundingSource: assign({ fundingSourceChainId: () => undefined }),
    clearError: assign({
      lastErrorMessage: () => undefined,
      approvalOutcome: () => 'none' as const,
      nameUnavailable: () => false,
      isWalletBusy: () => false,
    }),
    clearMaxProgress: assign({
      maxProgressReached: () => undefined,
    }),
    setError: assign({
      approvalOutcome: ({ event }) =>
        event.type === 'transaction.failed'
          ? (event.approvalOutcome ?? 'none')
          : 'none',
      lastErrorMessage: ({ event }) =>
        match(event)
          .with({ type: 'transaction.failed' }, ({ message }) => message)
          .with({ type: '$error' }, ({ error }) =>
            getRegistrationFailureMessage(error),
          )
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
    // A live run's record is cleared by the persistence subscriber once its
    // child cancels to idle. A restored failure has no live child, so its
    // record has to be discarded here.
    discardStoredRegistration: ({ context }) => {
      if (context.restoredRun) {
        clearStoredRegistrationIfUnchanged(context.restoredRun)
      }
    },
    restoreFailure: assign(({ event, context }) =>
      event.type === 'registration.failure.restore'
        ? { confirmedData: event.confirmedData, restoredRun: event.run }
        : context,
    ),
    clearRegistrationData: assign({
      pendingStart: () => undefined,
      restoredRun: () => undefined,
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

/**
 * The L2 a start pays from, whose wallet signs the commit leg there. One the
 * run cannot pay from refuses the start rather than paying from the wallet.
 */
const getStartL2Funding = (
  chainId: number | undefined,
  owner: Address,
  isHcaRegistration: boolean,
): L2FundingSource | Error | undefined => {
  if (chainId === undefined) return undefined
  const source = isHcaRegistration
    ? getL2FundingSource(owner, chainId)
    : undefined
  return (
    source ??
    new Error('Cannot register: paying from that network is not supported.')
  )
}

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

    const resolverOwnerAddress = ownerAddress

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

    const l2Funding = getStartL2Funding(
      event.l2FundingChainId,
      ownerAddress,
      isHcaRegistration,
    )
    if (l2Funding instanceof Error) {
      return enqueue.raise({ type: '$error', error: l2Funding })
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

    // The child takes the run from here, so a restored failure is no longer
    // what the failure screen would show.
    enqueue.assign({ pendingStart: undefined, restoredRun: undefined })

    enqueue(
      machineSetup.sendTo(REGISTRATION_V2_ACTOR_ID, {
        type: 'START_REGISTRATION',
        approveBeforeCommit: true,
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
        l2Funding,
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
      duration: Number(event.confirmedData.duration),
      selectedToken: event.confirmedData.token,
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

    // The child takes the run from here, so a restored failure is no longer
    // what the failure screen would show.
    enqueue.assign({ pendingStart: undefined, restoredRun: undefined })

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
          approveBeforeCommit: true,
          approvalSigner,
          publicClient: defaultPublicClient,
          hcaSessionEnable: event.hcaSessionEnable,
          // A run paid from an L2 keeps paying from it; one the app no longer
          // lists falls back to the funding permit.
          l2Funding:
            event.record.context.l2FundingChainId === undefined
              ? undefined
              : getL2FundingSource(
                  ownerAddress,
                  event.record.context.l2FundingChainId,
                ),
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
            message: getRegistrationFailureMessage(snapshot.context.error),
            hasCommitment:
              !!snapshot.context.commitment ||
              !!snapshot.context.commitmentTxId,
            approvalOutcome: match(snapshot.context.retryTarget)
              .returnType<ApprovalOutcome>()
              .with(P.union('signingFundingPermit', 'approvingToken'), () =>
                isUserRejectionError(snapshot.context.error)
                  ? 'rejected'
                  : 'failed',
              )
              .otherwise(() => 'none'),
            // Lost a same-name race: the child refuses RETRY, so the failure
            // screen must not offer one either. A race lost before the reveal
            // (price read, budget quote) only shows up as the registrar's
            // revert, so read it off the error too.
            nameUnavailable:
              snapshot.context.nameUnavailable === true ||
              isNameNotAvailableError(snapshot.context.error),
          })),
        ],
      },
      {
        // New runs reach this point once the commitment is submitted. A
        // resumed run can have a validated commitment and cooldown timestamp
        // without a local transaction ID. Both have completed upfront approval.
        guard: ({ event: { snapshot } }) =>
          (!!snapshot.context.commitmentTxId ||
            (!!snapshot.context.commitment &&
              snapshot.context.registerReadyTimestamp != null)) &&
          !snapshot.matches('idle') &&
          !snapshot.matches('computingHcaBudget') &&
          !snapshot.matches('checkingHcaFunding') &&
          !snapshot.matches('signingFundingPermit') &&
          !snapshot.matches('checkingAllowance') &&
          !snapshot.matches('approvingToken') &&
          !snapshot.matches('waitingForApproval'),
        actions: [
          raise({ type: 'registration.approved' }),
          'updateRegistrationStageFromChild',
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
    approvalOutcome: 'none',
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
        'registration.resume': [
          {
            guard: ({ event }) =>
              getResumeTarget(event.record) === 'settingUpRegistration',
            // No commitment was submitted. Reconfirm the live quote before
            // requesting a fresh approval instead of prompting on reconnect.
            target: '.tokens',
            actions: ['clearError', 'clearMaxProgress', 'restorePricing'],
          },
          {
            target: '#registrationV2Ui.registering',
            actions: [
              'clearError',
              'clearMaxProgress',
              resumeRegistrationAction,
            ],
          },
        ],
        // Scoped to `pricing` for the same reason as the resume above.
        'registration.failure.restore': {
          target: '#registrationV2Ui.failure',
          actions: ['clearError', 'clearMaxProgress', 'restoreFailure'],
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
              actions: 'clearError',
            },
            'pricing.token.select': {
              actions: ['setToken', 'clearFundingSource', 'clearError'],
            },
            'pricing.fundingSource.select': {
              actions: 'setFundingSource',
            },
            'pricing.dialog.dismiss': {
              target: 'duration',
              actions: 'clearError',
            },
            'registration.start': {
              target: 'approving',
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
        approving: {
          on: {
            // Ignore an assessment that resolves after a fresh run starts.
            'registration.resume': {},
            'registration.approved': {
              target: '#registrationV2Ui.registering',
            },
            'transaction.failed': [
              {
                guard: ({ event }) =>
                  !event.hasCommitment &&
                  (event.approvalOutcome === 'failed' ||
                    event.approvalOutcome === 'rejected'),
                target: 'tokens',
                actions: [
                  'setError',
                  'releaseRegistrationLock',
                  'clearRegistrationData',
                  'forwardCancel',
                ],
              },
              {
                target: '#registrationV2Ui.failure',
                actions: 'setError',
              },
            ],
            $error: {
              target: '#registrationV2Ui.failure',
              actions: 'setError',
            },
            'registration.suspend': {
              target: 'duration',
              actions: [
                'clearRegistrationData',
                'clearError',
                'clearMaxProgress',
                'forwardSuspend',
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
      // A reverted register says nothing about why, so ask the registry
      // whether someone else got the name first
      invoke: {
        src: 'checkNameTakenByOther',
        input: ({ context }) =>
          context.nameUnavailable || !context.confirmedData
            ? undefined
            : {
                label: context.confirmedData.label,
                owner: context.confirmedData.ownerAddress,
                chainId: context.chainId,
                publicClient: defaultPublicClient,
              },
        onDone: {
          guard: ({ event }) => event.output,
          actions: assign({ nameUnavailable: () => true }),
        },
      },
      on: {
        retry: [
          {
            // Nothing to forward to: the child never resumed. Try Again on a
            // restored failure resumes it through `useRegistrationResume`.
            guard: 'isRestoredFailure',
          },
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
            target: 'pricing.approving',
            actions: ['clearError', 'acquireRegistrationLock', 'forwardRetry'],
          },
        ],
        'registration.start': {
          target: 'pricing.approving',
          guard: ({ event }) => event.duration >= MIN_REGISTER_DURATION_SECONDS,
          actions: ['clearError', 'clearMaxProgress', startRegistrationAction],
        },
        'registration.resume': [
          {
            guard: ({ event }) =>
              getResumeTarget(event.record) === 'settingUpRegistration',
            target: 'pricing.tokens',
            actions: [
              'releaseRegistrationLock',
              'clearError',
              'clearMaxProgress',
              'restorePricing',
              'forwardCancel',
            ],
          },
          {
            target: 'registering',
            actions: [
              'clearError',
              'clearMaxProgress',
              resumeRegistrationAction,
            ],
          },
        ],
        cancel: [
          {
            // Back to Quote abandons the stored run, commitment included: the
            // user has chosen to start over.
            guard: 'isRestoredFailure',
            target: 'pricing',
            actions: [
              'discardStoredRegistration',
              'clearRegistrationData',
              'clearError',
            ],
          },
          {
            target: 'pricing',
            actions: [
              'releaseRegistrationLock',
              // A name lost to someone else is still cached as available, so
              // the quote would offer it again. Must run before the label is
              // cleared.
              'invalidateNameQueries',
              'clearRegistrationData',
              'clearError',
              'forwardCancel',
            ],
          },
        ],
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
    snapshot.matches({ pricing: 'approving' }) ||
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
