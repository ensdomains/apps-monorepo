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
  submitPermitAndRenewActor,
  submitRenewActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { $qk, qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync, type ResultAsync } from 'neverthrow'
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
 * into the first renewal, or `undefined` (already authorized, or EOA `approve`).
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

/** Submit and confirm a single renewal, bundling the permit if one is given. */
const renewOne = (
  ctx: Context,
  item: RenewItem,
  permit: PermitSignature | undefined,
): ResultAsync<void, Error> =>
  (permit
    ? submitPermitAndRenewActor({
        permit,
        selectedToken: ctx.token,
        label: item.label,
        duration: item.duration,
        signer: ctx.signer,
        publicClient,
        sponsored: true,
      })
    : submitRenewActor({
        label: item.label,
        duration: item.duration,
        selectedToken: ctx.token,
        signer: ctx.signer,
        publicClient,
        sponsored: ctx.isHca,
      })
  ).andThen((txId) => pollTransactionStatusActor({ txId }))

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
 * Drives the sequential bulk renewal: authorize the summed spend once, then
 * submit and confirm one `renew` per name, tracking each row's status for the
 * progress UI. Mirrors the single-name `renewalUiMachine`. Names that already
 * renewed are remembered so a retry only resumes the ones that failed.
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
    for (const [index, item] of remaining.entries()) {
      markStatus(item.label, 'active')
      // The permit must ride in a transaction — bundle it with the first renew.
      const renewed = await renewOne(
        ctx,
        item,
        index === 0 ? permit : undefined,
      )
      if (renewed.isErr()) return failWith(renewed.error)
      completed.add(item.label)
      invalidateName(item.label)
      markStatus(item.label, 'done')
    }

    invalidateDashboardNames()
    // Let the bar settle at 100% before flipping to the success view.
    await wait(SETTLE_MS)
    setPhase('success')
  }

  return { phase, statuses, errorMessage, submit, reset }
}
