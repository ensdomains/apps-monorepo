import type { Signer } from '@ens-apps/transaction-manager'
import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import {
  authorizedPaymentAmount,
  ensureHcaDeployedActor,
  type PermitSignature,
  pollTransactionStatusActor,
  readPaymentTokenAllowanceActor,
  signPermitActor,
  submitApprovalActor,
  submitBatchRenewActor,
  submitRenewActor,
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

type Context = {
  readonly signer: Signer
  readonly approvalSigner: Signer | undefined
  readonly ownerAddress: Address
  readonly token: SUPPORTED_TOKEN
  readonly isHca: boolean
}

/**
 * Authorize the whole batch once. `renew` charges the EOA owner, so the
 * allowance is always keyed to it. Resolves to a permit (HCA path) to bundle
 * into the batch transaction, or `undefined` (already authorized, or the EOA
 * path's on-chain `approve`).
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

      if (ctx.isHca) {
        // Gasless EIP-2612 permit (signed by the EOA), sized to cover the batch.
        return signPermitActor({
          owner: ctx.ownerAddress,
          selectedToken: ctx.token,
          value: authorizedPaymentAmount(sumPriceRaw),
          approvalSigner: ctx.approvalSigner ?? ctx.signer,
          publicClient,
        })
      }

      // Pure-EOA: one on-chain approve covering the summed amount.
      return submitApprovalActor({
        tokenPrice: sumPriceRaw,
        selectedToken: ctx.token,
        signer: ctx.approvalSigner ?? ctx.signer,
        publicClient,
        sponsored: false,
      })
        .andThen((txId) => pollTransactionStatusActor({ txId }))
        .map(() => undefined)
    })

/**
 * Submit and confirm a single renewal. Only used on the EOA fallback path
 * (dev-only `USE_EOA` fork), which can't batch and never carries a permit — the
 * spend is authorized up front with a plain on-chain `approve`.
 */
const renewOne = (ctx: Context, item: RenewItem): ResultAsync<void, Error> =>
  submitRenewActor({
    label: item.label,
    duration: item.duration,
    selectedToken: ctx.token,
    signer: ctx.signer,
    publicClient,
    sponsored: ctx.isHca,
  }).andThen((txId) => pollTransactionStatusActor({ txId }))

/**
 * Submit and confirm the WHOLE batch as one transaction (smart-account path):
 * a single intent of `[permit?, renew, renew, …]` that executes atomically, per
 * WEB-427. Because it's atomic, the batch either fully renews or fully fails —
 * there's no partial-completion state to resume.
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
 * Run the renewing phase and report per-row progress. Smart accounts renew the
 * whole batch in one atomic transaction (all rows advance together); the EOA
 * fallback renews one name per transaction. `onActive`/`onDone` drive the row
 * status UI and record completions so a retry resumes correctly.
 */
const runRenewals = async (
  ctx: Context,
  remaining: readonly RenewItem[],
  permit: PermitSignature | undefined,
  onActive: (label: string) => void,
  onDone: (label: string) => void,
): Promise<Result<void, Error>> => {
  if (ctx.isHca) {
    for (const item of remaining) onActive(item.label)
    const renewed = await renewBatch(ctx, remaining, permit)
    if (renewed.isErr()) return renewed
    for (const item of remaining) onDone(item.label)
    return ok(undefined)
  }

  for (const item of remaining) {
    onActive(item.label)
    const renewed = await renewOne(ctx, item)
    if (renewed.isErr()) return renewed
    onDone(item.label)
  }
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
 * Drives the bulk renewal: authorize the summed spend once, then renew. Smart
 * accounts submit the whole batch as a single atomic transaction (WEB-427); the
 * dev-only EOA fork falls back to one `renew` per name. Each row's status feeds
 * the progress UI, and names that already renewed are remembered so a retry only
 * resumes the ones that failed.
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
