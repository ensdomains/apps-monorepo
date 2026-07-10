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
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import type { ResultAsync } from 'neverthrow'
import { useState } from 'react'
import type { Address, WalletClient } from 'viem'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'
import type { BulkRenewPhase, RenewItem, RowStatus } from './types'

/** Unwrap a neverthrow `ResultAsync`, throwing on error so `try/catch` works. */
const unwrap = async <T>(result: ResultAsync<T, Error>): Promise<T> => {
  const settled = await result
  if (settled.isErr()) throw settled.error
  return settled.value
}

type Context = {
  readonly signer: Signer
  readonly approvalSigner: Signer | undefined
  readonly ownerAddress: Address
  readonly token: SUPPORTED_TOKEN
  readonly isHca: boolean
}

/**
 * Authorize the whole batch once. `renew` charges the EOA owner, so the
 * allowance is always keyed to it. Returns a permit (HCA path) to bundle into
 * the first renewal, or `undefined` (already authorized, or EOA `approve`).
 */
const authorizeSpend = async (
  ctx: Context,
  sumPriceRaw: bigint,
): Promise<PermitSignature | undefined> => {
  const allowanceResult = await readPaymentTokenAllowanceActor({
    owner: ctx.ownerAddress,
    selectedToken: ctx.token,
    publicClient,
  })
  const allowance = allowanceResult.isOk() ? allowanceResult.value : 0n
  if (allowance >= sumPriceRaw) return undefined

  if (ctx.isHca) {
    // Gasless EIP-2612 permit (signed by the EOA), sized to cover every name.
    return unwrap(
      signPermitActor({
        owner: ctx.ownerAddress,
        selectedToken: ctx.token,
        value: authorizedPaymentAmount(sumPriceRaw),
        approvalSigner: ctx.approvalSigner ?? ctx.signer,
        publicClient,
      }),
    )
  }

  // Pure-EOA: one on-chain approve covering the summed amount.
  const approvalTxId = await unwrap(
    submitApprovalActor({
      tokenPrice: sumPriceRaw,
      selectedToken: ctx.token,
      signer: ctx.approvalSigner ?? ctx.signer,
      publicClient,
      sponsored: false,
    }),
  )
  await unwrap(pollTransactionStatusActor({ txId: approvalTxId }))
  return undefined
}

/** Submit and confirm a single renewal, bundling the permit if one is given. */
const renewOne = async (
  ctx: Context,
  item: RenewItem,
  permit: PermitSignature | undefined,
): Promise<void> => {
  // The permit must ride in a transaction — bundle it with this renew.
  const txId = permit
    ? await unwrap(
        submitPermitAndRenewActor({
          permit,
          selectedToken: ctx.token,
          label: item.label,
          duration: item.duration,
          signer: ctx.signer,
          publicClient,
          sponsored: true,
        }),
      )
    : await unwrap(
        submitRenewActor({
          label: item.label,
          duration: item.duration,
          selectedToken: ctx.token,
          signer: ctx.signer,
          publicClient,
          sponsored: ctx.isHca,
        }),
      )
  await unwrap(pollTransactionStatusActor({ txId }))
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

const invalidateRenewedNames = (items: readonly RenewItem[]) => {
  const queryClient = getQueryClient()
  if (!queryClient) return
  for (const item of items) {
    queryClient.invalidateQueries({
      queryKey: $qk({ name: `${item.label}.eth` }),
    })
  }
}

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
 * progress UI. Mirrors the single-name `renewalUiMachine`.
 */
export const useBulkRenewSubmit = (): UseBulkRenewSubmit => {
  const account = useSmartAccountContext()
  const [phase, setPhase] = useState<BulkRenewPhase>('idle')
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [errorMessage, setErrorMessage] = useState<string | undefined>()

  const reset = () => {
    setPhase('idle')
    setStatuses({})
    setErrorMessage(undefined)
  }

  const submit = async ({ items, token, sumPriceRaw }: SubmitArgs) => {
    const ctx = resolveContext(account, token)
    if (!ctx) {
      setErrorMessage('Wallet not connected')
      setPhase('error')
      return
    }

    setErrorMessage(undefined)
    setStatuses(
      Object.fromEntries(items.map((item) => [item.label, 'pending'])),
    )
    setPhase('preparing')

    try {
      await unwrap(ensureHcaDeployedActor({ signer: ctx.signer }))

      setPhase('authorizing')
      const permit = await authorizeSpend(ctx, sumPriceRaw)

      setPhase('renewing')
      for (const [index, item] of items.entries()) {
        setStatuses((prev) => ({ ...prev, [item.label]: 'active' }))
        await renewOne(ctx, item, index === 0 ? permit : undefined)
        setStatuses((prev) => ({ ...prev, [item.label]: 'done' }))
      }

      invalidateRenewedNames(items)
      setPhase('success')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Renewal failed')
      setStatuses((prev) => {
        const next = { ...prev }
        for (const label of Object.keys(next)) {
          if (next[label] === 'active') next[label] = 'error'
        }
        return next
      })
      setPhase('error')
    }
  }

  return { phase, statuses, errorMessage, submit, reset }
}
