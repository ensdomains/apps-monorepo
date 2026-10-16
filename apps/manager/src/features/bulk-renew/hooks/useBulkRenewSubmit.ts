import {
  HcaFundingDeclinedError,
  type HcaFundingPrompt,
  type RhinestoneSigner,
  type Signer,
} from '@ens-apps/transaction-manager'
import {
  pollTransactionStatusActor,
  readPaymentTokenAllowanceActor,
  submitApprovalActor,
  submitRenewActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, okAsync, ResultAsync } from 'neverthrow'
import { useRef, useState } from 'react'
import type { Address, WalletClient } from 'viem'
import { envConfig } from '@/config'
import { invalidateDashboardNames } from '@/features/dashboard/service/queries/getDashboardNames'
import { getExpiry } from '@/features/profile/service/profileExpiry'
import {
  HCA_RENEWAL_INTENT_MAX_ITEMS,
  submitHcaRenewal,
} from '@/features/renew/service/hcaRenewal'
import { getRenewerAddress } from '@/features/renew/utils/renewalProtocol'
import {
  useHcaFundingPrompt,
  useSmartAccountContext,
} from '@/lib/smart-account'
import type { RENEWAL_TOKEN } from '@/lib/tokens'
import { publicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'
import type { BulkRenewPhase, RenewItem, RowStatus } from '../types'

// How long to hold the completed progress bar before showing the success view.
const SETTLE_MS = 600

// Bulk renewal takes whichever route the account has. With a smart account the
// whole selection renews as owner-signed HCA intents paid out of the account
// (rent in the chosen stable, fee in USDC) — one intent per chunk of names,
// each renewing its chunk atomically in a single `renewBatch`. Without one it
// falls back to the direct-wallet route: the connected EOA approves once and
// renews each name itself, one transaction per name.
//
// The wallet route cannot use the HCA. `AbstractETHRegistrar.renew` charges
// `msg.sender` with no HCA unwrap, and the scoped session's policy allowlists
// only `commit`/`register` on the registrar — a session-signed `renew` reverts
// `ActionNotAllowed`. Routing it through the HCA therefore means paying from
// the HCA (funding it with a permit when short) and signing the intent with the
// owner key, which is exactly what `submitHcaRenewal` does.
export const WALLET_REQUIRED_MESSAGE =
  'Bulk renewal requires a connected wallet to approve and pay for each renewal.'

export const RENEWED_CHECK_FAILED_MESSAGE =
  "Couldn't confirm which names already renewed, so none were retried. Please try again."

type Context = {
  /** The connected EOA — `msg.sender` for `renew`, and the rent payer. */
  readonly signer: Signer
  readonly ownerAddress: Address
  readonly token: RENEWAL_TOKEN
}

/**
 * Authorize the whole batch once: approve the registrar for the summed price so
 * the individual `renew` calls can each pull from the same allowance. Resolves
 * immediately when the existing allowance already covers the batch.
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

/** Renew one name and wait for it to land. */
const renewOne = (ctx: Context, item: RenewItem): ResultAsync<void, Error> =>
  submitRenewActor({
    label: item.label,
    duration: item.duration,
    selectedToken: ctx.token,
    signer: ctx.signer,
    publicClient,
  })
    .andThen((txId) => pollTransactionStatusActor({ txId }))
    .map(() => undefined)

/**
 * Renew each name in turn, reporting per-row progress.
 *
 * Sequential rather than atomic: each name is its own transaction, so a failure
 * part-way leaves the earlier names genuinely renewed. `onDone` records them so
 * a retry resumes from the first failure instead of re-paying for the batch.
 */
const runRenewals = ResultFn(async function* (
  ctx: Context,
  remaining: readonly RenewItem[],
  reporters: RowReporters,
) {
  const { onActive, onDone } = reporters
  for (const item of remaining) {
    onActive(item.label)
    yield* renewOne(ctx, item)
    onDone(item.label)
  }
  return ok(undefined)
})

type HcaContext = {
  readonly signer: RhinestoneSigner
  readonly ownerAddress: Address
  readonly walletClient: WalletClient
  readonly token: RENEWAL_TOKEN
}

/** Split the selection into the batches an intent can carry. */
const chunkItems = (items: readonly RenewItem[]): RenewItem[][] => {
  const chunks: RenewItem[][] = []
  for (
    let index = 0;
    index < items.length;
    index += HCA_RENEWAL_INTENT_MAX_ITEMS
  ) {
    chunks.push(items.slice(index, index + HCA_RENEWAL_INTENT_MAX_ITEMS))
  }
  return chunks
}

/**
 * Renew the selection one intent at a time.
 *
 * Each chunk is atomic: either every name in it renews or none does, which is
 * why progress is reported per chunk rather than per name. A failure stops the
 * run, and the chunks that already landed are recorded as done so a retry
 * resumes instead of re-paying for them.
 */
const runHcaRenewals = ResultFn(async function* (
  ctx: HcaContext,
  remaining: readonly RenewItem[],
  reporters: RowReporters,
  confirmFunding?: (prompt: HcaFundingPrompt) => Promise<boolean> | boolean,
) {
  const { onActive, onDone } = reporters
  for (const chunk of chunkItems(remaining)) {
    for (const item of chunk) onActive(item.label)

    yield* ResultAsync.fromPromise(
      submitHcaRenewal({
        items: chunk,
        // Bulk renewal is offered for v2 2LD `.eth` names only, so the
        // canonical v2 registrar is always the right renewer.
        renewerAddress: getRenewerAddress('v2'),
        protocol: 'v2',
        token: ctx.token,
        signer: ctx.signer,
        ownerAddress: ctx.ownerAddress,
        walletClient: ctx.walletClient,
        publicClient,
        chainId: envConfig.chain.id,
        ...(confirmFunding ? { confirmFunding } : {}),
      }),
      (error) => (error instanceof Error ? error : new Error(String(error))),
    )

    for (const item of chunk) onDone(item.label)
  }
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
 * Resolve the signer/owner context, or `null` if no wallet is connected.
 *
 * The owner is the connected wallet, NOT `account.ownerAddress` — `renew`
 * charges whoever sends it, so the allowance must be read for and authorized by
 * the same EOA that submits.
 */
const resolveContext = (
  account: SmartAccount,
  token: RENEWAL_TOKEN,
): Context | null => {
  const walletClient = account.walletClient
  const ownerAddress = walletClient?.account?.address
  if (!walletClient || !ownerAddress) return null
  return {
    signer: { type: 'eoa', walletClient: walletClient as WalletClient },
    ownerAddress,
    token,
  }
}

/**
 * Resolve the smart-account context, or `null` when the account has no HCA
 * (EOA-only mode) or is still initializing.
 */
const resolveHcaContext = (
  account: SmartAccount,
  token: RENEWAL_TOKEN,
): HcaContext | null => {
  const { signer, ownerAddress, walletClient } = account
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
): RowReporters => ({
  onActive: (label: string) => {
    if (isCurrent()) markStatus(label, 'active')
  },
  onDone: (label: string) => {
    completed.add(label)
    invalidateName(label)
    if (isCurrent()) markStatus(label, 'done')
  },
})

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
}

export type UseBulkRenewSubmit = {
  readonly phase: BulkRenewPhase
  readonly statuses: Readonly<Record<string, RowStatus>>
  readonly errorMessage: string | undefined
  /**
   * The USDC a funding permit is waiting to authorize, or `null`. Render a
   * dialog from this: the intent submit is parked until it is answered, and no
   * wallet signature is requested before then.
   */
  readonly fundingPrompt: HcaFundingPrompt | null
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
  const account = useSmartAccountContext()
  const {
    prompt: fundingPrompt,
    confirmFunding,
    approve: approveFunding,
    decline: declineFunding,
  } = useHcaFundingPrompt()
  const [phase, setPhase] = useState<BulkRenewPhase>('idle')
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const completedRef = useRef<Set<string>>(new Set())
  // Set by a failed run: the next submit re-reads expiries before paying.
  const failedRef = useRef(false)
  // Monotonic id for the active submission. Bumped on every `submit` and on
  // `reset`, so a superseded submission can detect it's stale and skip its UI
  // updates.
  const runIdRef = useRef(0)

  const reset = () => {
    runIdRef.current += 1
    completedRef.current = new Set()
    failedRef.current = false
    declineFunding()
    setPhase('idle')
    setStatuses({})
    setErrorMessage(undefined)
  }

  const markStatus = (label: string, status: RowStatus) =>
    setStatuses((prev) => ({ ...prev, [label]: status }))

  const failWith = (error: Error) => {
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
   * submitted and awaited here — so no allowance transaction and no polling.
   */
  const renewWithIntents = async (
    hca: HcaContext,
    remaining: readonly RenewItem[],
    isCurrent: () => boolean,
  ) => {
    setPhase('renewing')
    const renewed = await runHcaRenewals(
      hca,
      remaining,
      rowReporters(isCurrent, markStatus, completedRef.current),
      confirmFunding,
    )
    if (!isCurrent()) return
    if (renewed.isErr()) {
      // A declined prompt is not a failure: nothing was signed and nothing was
      // spent, so go back to the confirm step rather than showing an error.
      if (renewed.error instanceof HcaFundingDeclinedError) {
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
    remaining: readonly RenewItem[],
    sumPriceRaw: bigint,
    isCurrent: () => boolean,
  ) => {
    setPhase('authorizing')
    const authorized = await authorizeSpend(ctx, sumPriceRaw)
    if (!isCurrent()) return
    if (authorized.isErr()) return failWith(authorized.error)

    setPhase('renewing')
    const renewed = await runRenewals(
      ctx,
      remaining,
      rowReporters(isCurrent, markStatus, completedRef.current),
    )
    if (!isCurrent()) return
    if (renewed.isErr()) return failWith(renewed.error)

    await finishSuccess(isCurrent)
  }

  const submit = async ({ items, token, sumPriceRaw }: SubmitArgs) => {
    // Claim this run; if `reset` (or another submit) bumps the id while we await,
    // `isCurrent()` turns false and we stop touching the now-stale UI state.
    runIdRef.current += 1
    const runId = runIdRef.current
    const isCurrent = () => runIdRef.current === runId

    const hca = resolveHcaContext(account, token)
    const ctx = resolveContext(account, token)
    if (!hca && !ctx) {
      setErrorMessage(WALLET_REQUIRED_MESSAGE)
      setPhase('error')
      return
    }

    // A failed run may have renewed names it never recorded, so a retry
    // re-reads their expiries before paying again.
    if (failedRef.current && !(await recordLandedRenewals(items, isCurrent))) {
      return
    }

    // Skip names already renewed in an earlier attempt (retry resumes failures).
    const completed = completedRef.current
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

    if (hca) return renewWithIntents(hca, remaining, isCurrent)
    // `ctx` exists wherever `hca` does not — the guard above rejected the
    // no-context case.
    if (ctx) return renewWithWallet(ctx, remaining, sumPriceRaw, isCurrent)
  }

  return {
    phase,
    statuses,
    errorMessage,
    fundingPrompt,
    approveFunding,
    declineFunding,
    submit,
    reset,
  }
}
