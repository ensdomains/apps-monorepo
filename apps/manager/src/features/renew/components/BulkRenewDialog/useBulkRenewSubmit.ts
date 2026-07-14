import type { Signer } from '@ens-apps/transaction-manager'
import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import {
  authorizedPaymentAmount,
  ensureHcaDeployedActor,
  type PermitSignature,
  pollTransactionStatusActor,
  readPaymentTokenAllowanceActor,
  signPermitActor,
  submitBatchRenewActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { $qk, qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, okAsync, type Result, type ResultAsync } from 'neverthrow'
import { useCallback, useRef, useState } from 'react'
import type { Address, WalletClient } from 'viem'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'
import type { BulkRenewPhase, RenewItem, RowStatus } from './types'

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
  readonly token: SUPPORTED_TOKEN
  readonly isHca: boolean
}

/**
 * Authorize the whole batch once, gaslessly. Resolves to an EIP-2612 permit
 * (signed by the EOA owner, sized to cover the batch) to bundle into the batch
 * transaction, or `undefined` when the existing allowance already covers it.
 */
const authorizeSpend = (
  ctx: Context,
  sumPriceRaw: bigint,
): ResultAsync<PermitSignature | undefined, Error> =>
  readPaymentTokenAllowanceActor({
    owner: ctx.ownerAddress,
    selectedToken: ctx.token,
    publicClient,
  })
    // A read failure shouldn't block — fall back to authorizing.
    .orElse(() => okAsync(0n))
    .andThen((allowance): ResultAsync<PermitSignature | undefined, Error> => {
      if (allowance >= sumPriceRaw) return okAsync(undefined)

      return signPermitActor({
        owner: ctx.ownerAddress,
        selectedToken: ctx.token,
        value: authorizedPaymentAmount(sumPriceRaw),
        approvalSigner: ctx.approvalSigner ?? ctx.signer,
        publicClient,
      })
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
    items: items.map((item) => ({
      label: item.label,
      duration: item.duration,
    })),
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

type SmartAccount = ReturnType<typeof useSmartAccountContext>

/** Resolve the signer/owner context, or `null` if the wallet isn't ready. */
const resolveContext = (
  account: SmartAccount,
  token: SUPPORTED_TOKEN,
): Context | null => {
  const signer = account.signer
  const ownerAddress = account.ownerAddress ?? account.accountAddress
  if (!signer || !ownerAddress) return null
  return {
    signer,
    ownerAddress,
    token,
    isHca: signer.type === 'rhinestone',
    approvalSigner: account.walletClient
      ? { type: 'eoa', walletClient: account.walletClient as WalletClient }
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

  const reset = useCallback(() => {
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

    setPhase('preparing')
    const deployed = await ensureHcaDeployedActor({ signer: ctx.signer })
    if (deployed.isErr()) return failWith(deployed.error)

    setPhase('authorizing')
    const authorized = await authorizeSpend(ctx, sumPriceRaw)
    if (authorized.isErr()) return failWith(authorized.error)
    const permit = authorized.value

    setPhase('renewing')
    const renewed = await runRenewals(
      ctx,
      remaining,
      permit,
      (label) => markStatus(label, 'active'),
      (label) => {
        completed.add(label)
        invalidateName(label)
        markStatus(label, 'done')
      },
    )
    if (renewed.isErr()) return failWith(renewed.error)

    invalidateDashboardNames()
    // Let the bar settle at 100% before flipping to the success view.
    await wait(SETTLE_MS)
    setPhase('success')
  }

  return { phase, statuses, errorMessage, submit, reset }
}
