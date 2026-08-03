import type { Signer } from '@ens-apps/transaction-manager'
import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import {
  authorizedPaymentAmount,
  ensureHcaDeployedActor,
  type PermitSignature,
  pollTransactionStatusActor,
  signPermitActor,
  submitBatchRenewActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { $qk, qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, type Result, type ResultAsync } from 'neverthrow'
import { useCallback, useRef, useState } from 'react'
import type { Address } from 'viem'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'
import type { BulkRenewPhase, RenewItem, RowStatus } from '../types'

// How long to hold the completed progress bar before showing the success view.
const SETTLE_MS = 600

// WEB-427 requires the whole batch to renew in ONE transaction, which only a
// smart account can do (atomic multi-call intents). A plain EOA — the dev-only
// `USE_EOA` fork — physically can't (the registrar isn't Multicallable), so bulk
// renewal is unsupported there rather than silently fanning out into one tx per
// name. The dialog gates on this too; this is the transaction-boundary backstop.
export const EOA_UNSUPPORTED_MESSAGE =
  'Bulk renewal requires a smart account and is unavailable in EOA mode.'

type Context = {
  readonly signer: Signer
  readonly approvalSigner: Signer | undefined
  readonly ownerAddress: Address
  readonly accountAddress: Address
  readonly token: SUPPORTED_TOKEN
  readonly isHca: boolean
}

/**
 * Authorize the whole batch once, gaslessly. Resolves to an EIP-2612 permit
 * signed by the EOA owner and sized to cover the batch, letting the HCA pull
 * those funds into itself inside the batch transaction.
 *
 * Bulk renewal is smart-account-only, and the registrar charges its literal
 * `msg.sender` — the HCA — which holds no tokens between batches. So there is
 * no "allowance already covers it" shortcut to take here: even a maxed-out
 * `allowance[HCA][registrar]` is useless if the HCA has no balance to spend.
 * Every batch re-funds the HCA from the owner EOA.
 */
const authorizeSpend = (
  ctx: Context,
  sumPriceRaw: bigint,
): ResultAsync<PermitSignature | undefined, Error> =>
  signPermitActor({
    owner: ctx.ownerAddress,
    // The HCA is the spender: it pulls the EOA's funds into itself, then
    // approves the registrar from its own balance (see `buildHcaPaymentCalls`).
    spender: ctx.accountAddress,
    selectedToken: ctx.token,
    value: authorizedPaymentAmount(sumPriceRaw),
    approvalSigner: ctx.approvalSigner ?? ctx.signer,
    publicClient,
  })

/**
 * Submit and confirm the WHOLE batch as one transaction: a single smart-account
 * intent of `[permit?, renew, renew, …]` that executes atomically, per WEB-427.
 * Because it's atomic, the batch either fully renews or fully fails — there's no
 * partial-completion state to resume.
 */
const renewBatch = (
  ctx: Context,
  items: readonly RenewItem[],
  permit: PermitSignature | undefined,
): ResultAsync<void, Error> =>
  submitBatchRenewActor({
    items,
    selectedToken: ctx.token,
    signer: ctx.signer,
    publicClient,
    permit,
    sponsored: true,
  }).andThen((txId) => pollTransactionStatusActor({ txId }))

/**
 * Run the renewing phase and report per-row progress. The batch renews in one
 * atomic transaction, so all rows advance together. `onActive`/`onDone` drive
 * the row status UI and record completions.
 */
const runRenewals = async (
  ctx: Context,
  remaining: readonly RenewItem[],
  permit: PermitSignature | undefined,
  onActive: (label: string) => void,
  onDone: (label: string) => void,
): Promise<Result<void, Error>> => {
  for (const item of remaining) onActive(item.label)
  const renewed = await renewBatch(ctx, remaining, permit)
  if (renewed.isErr()) return renewed
  for (const item of remaining) onDone(item.label)
  return ok(undefined)
}

/** Sentinel returned by `prepareSpend` when the run was superseded mid-flight. */
const STALE = Symbol('stale-run')

/**
 * Drive the `preparing`/`authorizing` phases: ensure the HCA is deployed and the
 * batch spend is authorized. Returns the permit to bundle (or `undefined` when
 * already authorized), an `Error` to fail with, or `STALE` if the run was
 * superseded (dialog reset) while awaiting.
 */
const prepareSpend = async (
  ctx: Context,
  sumPriceRaw: bigint,
  isCurrent: () => boolean,
  setPhase: (phase: BulkRenewPhase) => void,
): Promise<PermitSignature | undefined | Error | typeof STALE> => {
  setPhase('preparing')
  const deployed = await ensureHcaDeployedActor({ signer: ctx.signer })
  if (!isCurrent()) return STALE
  if (deployed.isErr()) return deployed.error

  setPhase('authorizing')
  const authorized = await authorizeSpend(ctx, sumPriceRaw)
  if (!isCurrent()) return STALE
  if (authorized.isErr()) return authorized.error
  return authorized.value
}

type SmartAccount = ReturnType<typeof useSmartAccountContext>

/** Resolve the signer/owner context, or `null` if the wallet isn't ready. */
const resolveContext = (
  account: SmartAccount,
  token: SUPPORTED_TOKEN,
): Context | null => {
  const signer = account.signer
  const ownerAddress = account.ownerAddress ?? account.accountAddress
  const accountAddress = account.accountAddress
  if (!signer || !ownerAddress || !accountAddress) return null
  return {
    signer,
    ownerAddress,
    accountAddress,
    token,
    isHca: signer.type === 'rhinestone',
    approvalSigner: account.walletClient
      ? { type: 'eoa', walletClient: account.walletClient }
      : undefined,
  }
}

/** Refresh a single renewed name's profile/expiry queries. */
const invalidateName = (label: string) =>
  getQueryClient()?.invalidateQueries({
    queryKey: $qk({ name: `${label}.eth` }),
  })

/** Refresh the dashboard owned-names list so renewed expiries update. */
const invalidateDashboardNames = () =>
  getQueryClient()?.invalidateQueries({
    queryKey: qk('dashboard', 'all_domains'),
  })

type SubmitArgs = {
  readonly items: readonly RenewItem[]
  readonly token: SUPPORTED_TOKEN
  /** Summed quoted price in token units, used to size the allowance/permit. */
  readonly sumPriceRaw: bigint
}

export type UseBulkRenewSubmit = {
  readonly phase: BulkRenewPhase
  readonly statuses: Readonly<Record<string, RowStatus>>
  readonly errorMessage: string | undefined
  readonly submit: (args: SubmitArgs) => Promise<void>
  readonly reset: () => void
}

/**
 * Drives the bulk renewal: authorize the summed spend once, then submit the
 * whole batch as a single atomic smart-account transaction (WEB-427). Requires a
 * smart account — the EOA path is refused up front (see `EOA_UNSUPPORTED_MESSAGE`).
 * Each row's status feeds the progress UI, and names that already renewed are
 * remembered so a retry resumes the batch.
 */
export const useBulkRenewSubmit = (): UseBulkRenewSubmit => {
  const account = useSmartAccountContext()
  const [phase, setPhase] = useState<BulkRenewPhase>('idle')
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const completedRef = useRef<Set<string>>(new Set())
  // Monotonic id for the active submission. Bumped on every `submit` and on
  // `reset`, so a submission that resolves after the dialog was closed/reopened
  // (which calls `reset`) can detect it's stale and skip its UI updates — e.g.
  // no phantom "success" screen landing on a freshly reopened dialog.
  const runIdRef = useRef(0)

  const reset = useCallback(() => {
    runIdRef.current += 1
    completedRef.current = new Set()
    setPhase('idle')
    setStatuses({})
    setErrorMessage(undefined)
  }, [])

  const markStatus = (label: string, status: RowStatus) =>
    setStatuses((prev) => ({ ...prev, [label]: status }))

  const failWith = (error: Error) => {
    setErrorMessage(error.message)
    setStatuses((prev) => {
      const next = { ...prev }
      for (const label of Object.keys(next)) {
        if (next[label] === 'active') next[label] = 'error'
      }
      return next
    })
    // Refresh whatever DID renew before the failure.
    invalidateDashboardNames()
    setPhase('error')
  }

  const submit = async ({ items, token, sumPriceRaw }: SubmitArgs) => {
    // Claim this run; if `reset` (or another submit) bumps the id while we await,
    // `isCurrent()` turns false and we stop touching the now-stale UI state.
    runIdRef.current += 1
    const runId = runIdRef.current
    const isCurrent = () => runIdRef.current === runId

    const ctx = resolveContext(account, token)
    if (!ctx) {
      setErrorMessage('Wallet not connected')
      setPhase('error')
      return
    }

    // Enforce the one-transaction invariant: refuse the EOA path outright rather
    // than submitting a renew tx per name.
    if (!ctx.isHca) {
      setErrorMessage(EOA_UNSUPPORTED_MESSAGE)
      setPhase('error')
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

    const prepared = await prepareSpend(ctx, sumPriceRaw, isCurrent, setPhase)
    if (prepared === STALE) return
    if (prepared instanceof Error) return failWith(prepared)
    const permit = prepared

    setPhase('renewing')
    const renewed = await runRenewals(
      ctx,
      remaining,
      permit,
      (label) => isCurrent() && markStatus(label, 'active'),
      (label) => {
        // The renewal landed on-chain, so record it and refresh data even if the
        // dialog was reset mid-flight; only the row-status UI is run-scoped.
        completed.add(label)
        invalidateName(label)
        if (isCurrent()) markStatus(label, 'done')
      },
    )
    if (!isCurrent()) return
    if (renewed.isErr()) return failWith(renewed.error)

    invalidateDashboardNames()
    // Let the bar settle at 100% before flipping to the success view.
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    if (!isCurrent()) return
    setPhase('success')
  }

  return { phase, statuses, errorMessage, submit, reset }
}
