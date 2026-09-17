import type { EOATransactionRequest } from '@ens-apps/transaction-manager'
import { fromThrowable } from 'neverthrow'
import type { WalletClientWithAccount } from '@/utils/types'
import type { Transaction } from '../types'

/**
 * The pure half of the flow gas check: which steps still cost money, how their
 * calls are encoded, and what each one is worth at the current fee.
 *
 * Kept out of the hook so the rules are testable without a wallet, a chain, or
 * a rendered component. The hook's job is to supply wallet and query state.
 */

/**
 * Ids of the steps not yet paid for, joined into one string.
 *
 * A string rather than an array because it is used as a memo key: the filtered
 * array is a new identity on every render, while the actor Map it is derived
 * from keeps the SAME identity across transitions (an actor mutates its own
 * snapshot in place). Keying on either directly would re-encode constantly or
 * never notice a step settling.
 */
export const unpaidStepKey = (
  transactions: readonly Transaction[],
  isSettled: (id: string) => boolean,
): string =>
  transactions
    .filter((transaction) => !isSettled(transaction.id))
    .map((transaction) => transaction.id)
    .join('|')

/** Reverse of {@link unpaidStepKey}, for callers that need the set back. */
export const parseUnpaidStepKey = (key: string): ReadonlySet<string> =>
  new Set(key ? key.split('|') : [])

/**
 * Encode the EOA call behind each unpaid step.
 *
 * Builders throw on states the UI reaches legitimately (nothing selected yet, a
 * step whose precondition an earlier step has not created), so a step that
 * cannot be encoded yields `undefined` and later marks the sum incomplete
 * rather than failing the whole verdict. Same contract as `EstimatedGasCost`.
 */
export const prepareUnpaidStepRequests = (params: {
  readonly transactions: readonly Transaction[]
  readonly unpaidIds: ReadonlySet<string>
  readonly walletClient: WalletClientWithAccount | undefined
  readonly chainId: number
}): readonly (EOATransactionRequest | undefined)[] => {
  const { transactions, unpaidIds, walletClient, chainId } = params
  return transactions
    .filter((transaction) => unpaidIds.has(transaction.id))
    .map((transaction) => {
      const prepare = transaction.intent?.prepare
      if (!walletClient || !prepare) return undefined
      const prepared = fromThrowable(
        prepare,
        () => undefined,
      )({ walletClient, chainId }).unwrapOr(undefined)
      const request = prepared?.request
      return request?.type === 'eoa' ? request : undefined
    })
}

/**
 * Price resolved gas units at the EIP-1559 ceiling, the same fee model the
 * transaction manager submits under.
 *
 * An unresolved fee makes every step unknown rather than free, so the verdict
 * degrades to `unknown` instead of reading as a flow that costs nothing.
 */
export const priceStepGas = (
  gasUnits: readonly (bigint | undefined)[],
  maxFeePerGas: bigint | undefined,
): readonly (bigint | null)[] =>
  gasUnits.map((units) =>
    units === undefined || maxFeePerGas === undefined
      ? null
      : units * maxFeePerGas,
  )
