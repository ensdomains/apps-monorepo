import {
  type HcaDisplayedDebit,
  type HcaFundingApprovalCapability,
  type HcaFundingApprovalState,
  HcaFundingDeclinedError,
  type RhinestoneSigner,
  type Signer,
} from '@ens-apps/transaction-manager'
import { HcaFundingApprovalDeclinedError } from '@ens-apps/transaction-manager/helpers/hca-funding-approval'
import {
  pollTransactionStatusActor,
  readPaymentTokenAllowanceActor,
  submitApprovalActor,
  submitRenewBatchActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { createAnalyticsFlowId } from '@ens-apps/utils/posthog/flowId'
import { normalizeReferrer } from '@ens-apps/utils/referrer'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useSearch } from '@tanstack/react-router'
import { err, ok, okAsync, ResultAsync } from 'neverthrow'
import { useEffect, useRef, useState } from 'react'
import type { Address, WalletClient } from 'viem'
import { envConfig } from '@/config'
import { invalidateDashboardNames } from '@/features/dashboard/service/queries/getDashboardNames'
import { getExpiry } from '@/features/profile/service/profileExpiry'
import { getL2FundingSource } from '@/features/register-v2/service/l2FundingSource'
import { useRenewalSigner } from '@/features/renew/hooks/useRenewalSigner'
import {
  fundHcaRenewalsFromL2,
  fundHcaRenewalsWithEth,
  type HcaRenewalL2Funding,
  submitHcaRenewal,
} from '@/features/renew/service/hcaRenewal'
import type { HcaRenewalEthFunding } from '@/features/renew/service/renewalEthSwap'
import { chunkRenewalItems } from '@/features/renew/utils/chunks'
import { getRenewerAddress } from '@/features/renew/utils/renewalProtocol'
import { type AnalyticsFlow, bindAnalyticsFlow } from '@/lib/posthog/flow'
import { ENS_LABS_REFERRER } from '@/lib/referrer'
import {
  useHcaFundingPrompt,
  useSmartAccountContext,
} from '@/lib/smart-account'
import type { RENEWAL_TOKEN } from '@/lib/tokens'
import { publicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'
import type { BulkRenewPhase, RenewItem, RowStatus } from '../types'
import { getBatchDisplayedDebit } from '../utils/batchDisplayedDebit'
import { getBulkRenewalCompletionCount } from '../utils/bulkRenewalCompletion'

type AttributedRenewItem = RenewItem & {
  readonly referrer: `0x${string}`
}

// How long to hold the completed progress bar before showing the success view.
const SETTLE_MS = 600

// Bulk renewal takes whichever route the account has. With a smart account the
// whole selection renews as owner-signed HCA intents paid out of the account
// (price in the chosen stable, fee in USDC) — one intent per chunk of names,
// each renewing its chunk atomically in a single `renewBatch`. Without one
// (EOA-only mode, or a Safe{Wallet}, which can't sign for its HCA) it takes the
// direct-wallet route: the wallet approves once, then sends one `renewBatch`
// transaction per chunk.
//
// The wallet route cannot use the HCA. `AbstractETHRegistrar.renew` charges
// `msg.sender` with no HCA unwrap, and the scoped session's policy allowlists
// only `commit`/`register` on the registrar — a session-signed `renew` reverts
// `ActionNotAllowed`. Routing it through the HCA therefore means paying from
// the HCA (funding it with a permit when short) and signing the intent with the
// owner key, which is exactly what `submitHcaRenewal` does.
export const WALLET_REQUIRED_MESSAGE =
  'Bulk renewal requires a connected wallet to approve and pay for each renewal.'

export const ACCOUNT_LOADING_MESSAGE =
  'Your smart account is still loading. Please try again in a moment.'

export const RENEWED_CHECK_FAILED_MESSAGE =
  "Couldn't confirm which names already renewed, so none were retried. Please try again."

type Context = {
  /** The connected EOA — `msg.sender` for `renew`, and who pays the price. */
  readonly signer: Signer
  readonly ownerAddress: Address
  readonly token: RENEWAL_TOKEN
}

/**
 * Authorize the whole selection once: approve the registrar for the summed
 * price so each chunk's `renewBatch` pulls from the same allowance. Resolves
 * immediately when the existing allowance already covers the selection.
 */
const authorizeSpend = (
  ctx: Context,
  sumPriceRaw: bigint,
): ResultAsync<void, Error> =>
  readPaymentTokenAllowanceActor({
    owner: ctx.ownerAddress,
    selectedToken: ctx.token,
    publicClient,
  })
    // A read failure shouldn't block — fall back to authorizing.
    .orElse(() => okAsync(0n))
    .andThen((allowance): ResultAsync<void, Error> => {
      if (allowance >= sumPriceRaw) return okAsync(undefined)

      return submitApprovalActor({
        tokenPrice: sumPriceRaw,
        selectedToken: ctx.token,
        signer: ctx.signer,
        publicClient,
      })
        .andThen((txId) => pollTransactionStatusActor({ txId }))
        .map(() => undefined)
    })

/**
 * Renew the selection one chunk at a time.
 *
 * Each chunk is atomic: either every name in it renews or none does, which is
 * why progress is reported per chunk rather than per name. A failure stops the
 * run, and the chunks that already landed are recorded as done so a retry
 * resumes instead of re-paying for them.
 */
const renewInChunks = ResultFn(async function* (
  remaining: readonly AttributedRenewItem[],
  { onActive, onDone }: RowReporters,
  renewChunk: (
    chunk: readonly AttributedRenewItem[],
  ) => ResultAsync<unknown, Error>,
  signal?: AbortSignal,
) {
  for (const chunk of chunkRenewalItems(remaining)) {
    if (signal?.aborted)
      return err(new Error('The bulk renewal screen was closed.'))
    for (const item of chunk) onActive(item.label)
    yield* renewChunk(chunk)
    for (const item of chunk) onDone(item.label)
  }
  return ok(undefined)
})

/** Wallet route: one `renewBatch` transaction per chunk, each awaited. */
const runRenewals = (
  ctx: Context,
  remaining: readonly AttributedRenewItem[],
  reporters: RowReporters,
) =>
  renewInChunks(remaining, reporters, (chunk) =>
    submitRenewBatchActor({
      renewals: chunk,
      selectedToken: ctx.token,
      signer: ctx.signer,
      publicClient,
    }).andThen((txId) => pollTransactionStatusActor({ txId })),
  )

const NO_WALLET_DEBIT: HcaDisplayedDebit = { usdc: 0n, token: 0n }

/** The swap is sized when it runs, on the names still to renew; only the ETH shown bounds it. */
type BulkEthFunding = Pick<HcaRenewalEthFunding, 'displayedCharge'>

type BulkIntentFunding =
  | { readonly status: 'refused'; readonly message: string }
  | {
      readonly status: 'ready'
      readonly shownDebit: HcaDisplayedDebit
      readonly fundingSource: BulkFundingSource | undefined
    }

/** What an intent run is checked against and paid from; refused rather than left unchecked or paid from the wallet instead. */
const getBulkIntentFunding = ({
  l2Payment,
  l2Source,
  ethPayment,
  displayedDebit,
}: {
  readonly l2Payment: SubmitArgs['l2Payment']
  readonly l2Source: HcaRenewalL2Funding['source'] | undefined
  readonly ethPayment: SubmitArgs['ethPayment']
  readonly displayedDebit: SubmitArgs['displayedDebit']
}): BulkIntentFunding => {
  if (l2Payment && !l2Source) {
    return {
      status: 'refused',
      message: 'Cannot renew: paying from that network is not supported.',
    }
  }
  // Paid from an L2 the wallet is shown nothing, so anything left for it is refused.
  if (l2Source) {
    return {
      status: 'ready',
      shownDebit: NO_WALLET_DEBIT,
      fundingSource: {
        kind: 'l2',
        l2Funding: {
          source: l2Source,
          displayedCharge: l2Payment?.displayedCharge,
        },
      },
    }
  }
  if (!displayedDebit) {
    return {
      status: 'refused',
      message: 'Cannot renew: the payment amount is not known yet.',
    }
  }
  return {
    status: 'ready',
    shownDebit: displayedDebit,
    fundingSource: ethPayment
      ? { kind: 'eth', ethFunding: ethPayment }
      : undefined,
  }
}

type HcaContext = {
  readonly signer: RhinestoneSigner
  readonly ownerAddress: Address
  readonly walletClient: WalletClient
  readonly token: RENEWAL_TOKEN
}

/** What pays every chunk's shortfall, once, before the chunks renew. */
type BulkFundingSource =
  | { readonly kind: 'l2'; readonly l2Funding: HcaRenewalL2Funding }
  | { readonly kind: 'eth'; readonly ethFunding: BulkEthFunding }

/** Smart-account route: one owner-signed intent per chunk. */
const runHcaRenewals = ResultFn(async function* (
  ctx: HcaContext,
  remaining: readonly AttributedRenewItem[],
  reporters: RowReporters,
  /** The wallet debit the sheet showed; each batch may take only what is left of it. */
  shownDebit: HcaDisplayedDebit,
  approvalFallback?: HcaFundingApprovalCapability,
  signal?: AbortSignal,
  fundingSource?: BulkFundingSource,
) {
  const toError = (error: unknown) =>
    error instanceof Error ? error : new Error(String(error))
  const intentParams = {
    // Bulk renewal is offered for v2 2LD `.eth` names only, so the
    // canonical v2 registrar is always the right renewer.
    renewerAddress: getRenewerAddress('v2'),
    protocol: 'v2',
    token: ctx.token,
    signer: ctx.signer,
    ownerAddress: ctx.ownerAddress,
    publicClient,
    chainId: envConfig.chain.id,
  } as const

  if (fundingSource) {
    for (const item of remaining) reporters.onActive(item.label)
  }
  if (fundingSource?.kind === 'l2') {
    yield* ResultAsync.fromPromise(
      fundHcaRenewalsFromL2({
        ...intentParams,
        batches: chunkRenewalItems(remaining),
        l2Funding: fundingSource.l2Funding,
      }),
      toError,
    )
  }
  // Buys the wallet's USDC for every remaining chunk's permit with one swap.
  if (fundingSource?.kind === 'eth') {
    yield* ResultAsync.fromPromise(
      fundHcaRenewalsWithEth({
        ...intentParams,
        walletClient: ctx.walletClient,
        batches: chunkRenewalItems(remaining),
        ethFunding: fundingSource.ethFunding,
        ...(signal ? { signal } : {}),
      }),
      toError,
    )
  }

  let movedUsdc = 0n
  yield* renewInChunks(
    remaining,
    reporters,
    (chunk) =>
      ResultAsync.fromPromise(
        submitHcaRenewal({
          ...intentParams,
          items: chunk,
          walletClient: ctx.walletClient,
          displayedDebit: getBatchDisplayedDebit(shownDebit, movedUsdc),
          ...(approvalFallback ? { approvalFallback } : {}),
          ...(signal ? { signal } : {}),
        }),
        toError,
      ).map((renewed) => {
        movedUsdc += renewed.incomingUsdc ?? 0n
        return renewed
      }),
    signal,
  )
  return ok(undefined)
})

/**
 * Labels whose on-chain expiry has moved past the one their run started from.
 * A renewal can land and still fail its wait, so a retry checks before paying.
 */
const findAlreadyRenewed = ResultFn(async function* (
  items: readonly RenewItem[],
) {
  const expiries = yield* ResultAsync.combine(
    items.map((item) => getExpiry(`${item.label}.eth`, 'v2')),
  )
  return ok(
    items
      .filter((item, index) => {
        const expiry = expiries[index]?.expiry
        return expiry != null && expiry > item.currentExpiry
      })
      .map((item) => item.label),
  )
})

type SmartAccount = ReturnType<typeof useSmartAccountContext>

/**
 * Resolve the wallet-route context, or `null` off that route: no wallet
 * connected, a smart account (which renews by intent), or a signer still
 * initializing — never a gas-paying fallback for a smart-account user.
 *
 * The owner is the connected wallet, NOT `account.ownerAddress` — `renew`
 * charges whoever sends it, so the allowance must be read for and authorized by
 * the same EOA that submits.
 */
const resolveContext = (
  signer: Signer | null,
  token: RENEWAL_TOKEN,
): Context | null => {
  if (signer?.type !== 'eoa') return null
  const ownerAddress = signer.walletClient.account?.address
  if (!ownerAddress) return null
  return { signer, ownerAddress, token }
}

/**
 * Resolve the smart-account context, or `null` when the account has no HCA
 * (EOA-only mode or a Safe{Wallet}) or is still initializing.
 */
const resolveHcaContext = (
  { ownerAddress, walletClient }: SmartAccount,
  signer: Signer | null,
  token: RENEWAL_TOKEN,
): HcaContext | null => {
  if (signer?.type !== 'rhinestone' || !ownerAddress || !walletClient) {
    return null
  }
  return { signer, ownerAddress, walletClient, token }
}

/**
 * Row-status reporters, shared by both routes.
 *
 * `onDone` records the name BEFORE the staleness check: it renewed on-chain, so
 * a superseded run must not forget it — only the row-status UI is run-scoped.
 */
type RowReporters = {
  readonly onActive: (label: string) => void
  readonly onDone: (label: string) => void
}

const rowReporters = (
  isCurrent: () => boolean,
  markStatus: (label: string, status: RowStatus) => void,
  completed: Set<string>,
  reportCompletion: () => void,
): RowReporters => ({
  onActive: (label: string) => {
    if (isCurrent()) markStatus(label, 'active')
  },
  onDone: (label: string) => {
    completed.add(label)
    reportCompletion()
    invalidateName(label)
    if (isCurrent()) markStatus(label, 'done')
  },
})

const createBulkRenewalCompletionReporter = (
  analytics: AnalyticsFlow | undefined,
  items: readonly RenewItem[],
  completed: ReadonlySet<string>,
) => {
  let hasReportedCompletion = false
  return () => {
    const itemCount = getBulkRenewalCompletionCount(items, completed)
    if (itemCount === undefined || hasReportedCompletion || !analytics) return
    hasReportedCompletion = true
    analytics.capture('renewal:flow_complete', {
      flow_id: analytics.flow_id,
      is_bulk: true,
      protocol_version: 'v2',
      item_count: itemCount,
      v1_item_count: 0,
      v2_item_count: itemCount,
    })
  }
}

/** Refresh a single renewed name's profile/expiry queries. */
const invalidateName = (label: string) =>
  getQueryClient()?.invalidateQueries({
    queryKey: $qk({ name: `${label}.eth` }),
  })

/** Refresh the dashboard owned-names list so renewed expiries update. */
const refreshDashboardNames = () => {
  const queryClient = getQueryClient()
  return queryClient ? invalidateDashboardNames(queryClient) : undefined
}

type SubmitArgs = {
  readonly items: readonly RenewItem[]
  readonly token: RENEWAL_TOKEN
  /** Summed quoted price in token units, used to size the allowance. */
  readonly sumPriceRaw: bigint
  /** Intent route: pay from the wallet's USDC on this L2, bounded by the charge shown. */
  readonly l2Payment?: {
    readonly chainId: number
    readonly displayedCharge?: bigint
  }
  /** Intent route: pay with the wallet's ETH, swapped into USDC, bounded by the ETH shown. */
  readonly ethPayment?: BulkEthFunding
  /** Intent route: the wallet debit the sheet showed, which bounds every batch. */
  readonly displayedDebit?: HcaDisplayedDebit
}

/** Only the account can be paid from an L2 or with ETH: never the wallet in its place. */
const isPaidFromAccount = ({
  l2Payment,
  ethPayment,
}: Pick<SubmitArgs, 'l2Payment' | 'ethPayment'>) =>
  l2Payment !== undefined || ethPayment !== undefined

export type UseBulkRenewSubmit = {
  readonly phase: BulkRenewPhase
  readonly statuses: Readonly<Record<string, RowStatus>>
  readonly errorMessage: string | undefined
  /**
   * A separately consented USDC approval waiting on the user. Render a dialog
   * from this: the intent submit is parked until it is answered.
   */
  readonly approvalState: HcaFundingApprovalState
  readonly approveFunding: () => void
  readonly declineFunding: () => void
  readonly submit: (args: SubmitArgs) => Promise<void>
  readonly reset: () => void
}

/**
 * Drives the bulk renewal. With a smart account each chunk of names is one
 * owner-signed intent paid from the account; otherwise the connected EOA approves the
 * summed spend once and renews each name in its own transaction. Names that
 * already renewed are remembered so a retry resumes rather than re-paying.
 */
export const useBulkRenewSubmit = (): UseBulkRenewSubmit => {
  const { referrer } = useSearch({ strict: false })
  const account = useSmartAccountContext()
  const signer = useRenewalSigner()
  const {
    confirmApproval,
    confirmApprovalRecovery,
    approvalState,
    onApprovalState,
    approve: approveFunding,
    decline: declineFunding,
  } = useHcaFundingPrompt()
  const [phase, setPhase] = useState<BulkRenewPhase>('idle')
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const abortRef = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      abortRef.current?.abort()
      runIdRef.current += 1
    },
    [],
  )
  const completedRef = useRef<Set<string>>(new Set())
  // Set by a failed run: the next submit re-reads expiries before paying.
  const failedRef = useRef(false)
  const analyticsRef = useRef<AnalyticsFlow | undefined>(undefined)
  // Monotonic id for the active submission. Bumped on every `submit` and on
  // `reset`, so a superseded submission can detect it's stale and skip its UI
  // updates.
  const runIdRef = useRef(0)

  const reset = () => {
    abortRef.current?.abort()
    runIdRef.current += 1
    completedRef.current = new Set()
    failedRef.current = false
    analyticsRef.current = undefined
    declineFunding()
    setPhase('idle')
    setStatuses({})
    setErrorMessage(undefined)
  }

  const markStatus = (label: string, status: RowStatus) =>
    setStatuses((prev) => ({ ...prev, [label]: status }))

  const failWith = (error: Error) => {
    const analytics = analyticsRef.current
    analytics?.capture('renewal:stage_fail', {
      flow_id: analytics.flow_id,
      is_bulk: true,
      protocol_version: 'v2',
      stage: 'execution',
      is_retryable: true,
      completed_count: completedRef.current.size,
    })
    failedRef.current = true
    setErrorMessage(error.message)
    setStatuses((prev) => {
      const next = { ...prev }
      for (const label of Object.keys(next)) {
        if (next[label] === 'active') next[label] = 'error'
      }
      return next
    })
    // Refresh whatever DID renew before the failure.
    refreshDashboardNames()
    setPhase('error')
  }

  /**
   * Abandon the run without failing it: nothing was signed and nothing was
   * spent, so the dialog goes back to the confirm step with the names still
   * pending (and the already-renewed ones still remembered).
   */
  const abortRun = () => {
    runIdRef.current += 1
    setStatuses((prev) => {
      const next = { ...prev }
      for (const label of Object.keys(next)) {
        if (next[label] === 'active') next[label] = 'pending'
      }
      return next
    })
    setErrorMessage(undefined)
    setPhase('idle')
  }

  /**
   * Record the names that renewed but were never marked done (the renewal
   * landed, its wait errored). `false` when the run should stop here.
   */
  const recordLandedRenewals = async (
    items: readonly RenewItem[],
    isCurrent: () => boolean,
  ): Promise<boolean> => {
    setPhase('preparing')
    const completed = completedRef.current
    const renewed = await findAlreadyRenewed(
      items.filter((item) => !completed.has(item.label)),
    )
    if (!isCurrent()) return false
    if (renewed.isErr()) {
      failWith(new Error(RENEWED_CHECK_FAILED_MESSAGE))
      return false
    }
    for (const label of renewed.value) {
      completed.add(label)
      invalidateName(label)
    }
    return true
  }

  /** Let the bar settle at 100% before flipping to the success view. */
  const finishSuccess = async (isCurrent: () => boolean) => {
    refreshDashboardNames()
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    if (!isCurrent()) return
    setPhase('success')
  }

  /**
   * Smart-account route: one owner-signed intent per chunk of names, each
   * submitted and awaited here, including any separately consented USDC approval.
   */
  const renewWithIntents = async (
    hca: HcaContext,
    remaining: readonly AttributedRenewItem[],
    isCurrent: () => boolean,
    l2Payment: SubmitArgs['l2Payment'],
    ethPayment: SubmitArgs['ethPayment'],
    displayedDebit: SubmitArgs['displayedDebit'],
    reporters: RowReporters,
    signal: AbortSignal,
  ) => {
    const funding = getBulkIntentFunding({
      l2Payment,
      l2Source:
        l2Payment && getL2FundingSource(hca.ownerAddress, l2Payment.chainId),
      ethPayment,
      displayedDebit,
    })
    if (funding.status === 'refused')
      return failWith(new Error(funding.message))
    setPhase('renewing')
    const renewed = await runHcaRenewals(
      hca,
      remaining,
      reporters,
      funding.shownDebit,
      { confirmApproval, confirmApprovalRecovery, onState: onApprovalState },
      signal,
      funding.fundingSource,
    )
    if (!isCurrent()) return
    if (renewed.isErr()) {
      // Either consent can be declined without submitting a renewal. The
      // separate approval prompt may follow an already-signed funding permit.
      if (
        renewed.error instanceof HcaFundingDeclinedError ||
        renewed.error instanceof HcaFundingApprovalDeclinedError
      ) {
        abortRun()
        return
      }
      return failWith(renewed.error)
    }

    await finishSuccess(isCurrent)
  }

  /** Wallet route: authorize the summed spend once, then renew name by name. */
  const renewWithWallet = async (
    ctx: Context,
    remaining: readonly AttributedRenewItem[],
    sumPriceRaw: bigint,
    isCurrent: () => boolean,
    reporters: RowReporters,
  ) => {
    setPhase('authorizing')
    const authorized = await authorizeSpend(ctx, sumPriceRaw)
    if (!isCurrent()) return
    if (authorized.isErr()) return failWith(authorized.error)

    setPhase('renewing')
    const renewed = await runRenewals(ctx, remaining, reporters)
    if (!isCurrent()) return
    if (renewed.isErr()) return failWith(renewed.error)

    await finishSuccess(isCurrent)
  }

  const beginAnalytics = (itemCount: number) => {
    if (!failedRef.current)
      analyticsRef.current = bindAnalyticsFlow(createAnalyticsFlowId() ?? '')
    const analytics = analyticsRef.current
    analytics?.capture(
      failedRef.current ? 'renewal:flow_retry' : 'renewal:flow_start',
      {
        v1_item_count: 0,
        v2_item_count: itemCount,
        flow_id: analytics.flow_id,
        is_bulk: true,
        protocol_version: 'v2',
      },
    )
    analytics?.capture('renewal:stage_enter', {
      flow_id: analytics.flow_id,
      is_bulk: true,
      protocol_version: 'v2',
      stage: 'execution',
    })
  }

  const submit = async ({
    items: inputItems,
    token,
    sumPriceRaw,
    l2Payment,
    ethPayment,
    displayedDebit,
  }: SubmitArgs) => {
    const items = inputItems.map((item) => ({
      ...item,
      referrer: normalizeReferrer(referrer, ENS_LABS_REFERRER),
    }))
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    // Claim this run; if `reset` (or another submit) bumps the id while we await,
    // `isCurrent()` turns false and we stop touching the now-stale UI state.
    runIdRef.current += 1
    const runId = runIdRef.current
    const isCurrent = () => runIdRef.current === runId

    const hca = resolveHcaContext(account, signer, token)
    const ctx = resolveContext(signer, token)
    if (!hca && !ctx) {
      setErrorMessage(
        account.walletClient && !signer
          ? ACCOUNT_LOADING_MESSAGE
          : WALLET_REQUIRED_MESSAGE,
      )
      setPhase('error')
      return
    }

    beginAnalytics(items.length)

    // A failed run may have renewed names it never recorded, so a retry
    // re-reads their expiries before paying again.
    if (failedRef.current && !(await recordLandedRenewals(items, isCurrent))) {
      return
    }

    // Skip names already renewed in an earlier attempt (retry resumes failures).
    const completed = completedRef.current
    const analytics = analyticsRef.current
    const signal = abortRef.current.signal
    const reportCompletion = createBulkRenewalCompletionReporter(
      analytics,
      items,
      completed,
    )
    const reporters = rowReporters(
      isCurrent,
      markStatus,
      completed,
      reportCompletion,
    )
    reportCompletion()
    const remaining = items.filter((item) => !completed.has(item.label))

    setErrorMessage(undefined)
    setStatuses(
      Object.fromEntries(
        items.map((item) => [
          item.label,
          completed.has(item.label) ? 'done' : 'pending',
        ]),
      ),
    )

    if (hca)
      return renewWithIntents(
        hca,
        remaining,
        isCurrent,
        l2Payment,
        ethPayment,
        displayedDebit,
        reporters,
        signal,
      )
    if (isPaidFromAccount({ l2Payment, ethPayment }))
      return failWith(new Error(ACCOUNT_LOADING_MESSAGE))
    // `ctx` exists wherever `hca` does not — the guard above rejected the
    // no-context case.
    if (ctx)
      return renewWithWallet(ctx, remaining, sumPriceRaw, isCurrent, reporters)
  }

  return {
    phase,
    statuses,
    errorMessage,
    approvalState,
    approveFunding,
    declineFunding,
    submit,
    reset,
  }
}
