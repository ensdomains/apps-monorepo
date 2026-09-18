import type { EOATransactionRequest } from '@ens-apps/transaction-manager'
import { fromThrowable } from 'neverthrow'
import type { WalletClientWithAccount } from '@/utils/types'
import type { Transaction } from '../types'

/**
 * Encode the EOA call behind each step that has not settled.
 *
 * Builders throw on states the UI reaches legitimately (nothing selected yet, a
 * step whose precondition an earlier step has not created), so a step that
 * cannot be encoded yields `undefined` and later marks the sum incomplete.
 */
export type UnpaidStep = {
  readonly request: EOATransactionRequest | undefined
  /** True once the machine holds the call, which is the key the row uses too. */
  readonly started: boolean
}

export const prepareUnpaidStepRequests = ({
  transactions,
  isSettled,
  activeRequestFor,
  walletClient,
  chainId,
}: {
  readonly transactions: readonly Transaction[]
  readonly isSettled: (id: string) => boolean
  readonly activeRequestFor: (id: string) => EOATransactionRequest | undefined
  readonly walletClient: WalletClientWithAccount | undefined
  readonly chainId: number
}): readonly UnpaidStep[] =>
  transactions
    .filter((transaction) => !isSettled(transaction.id))
    .map((transaction) => {
      // A started step is priced from the call the machine holds, not the
      // descriptor fallback, so it lands on the same key as its row.
      const active = activeRequestFor(transaction.id)
      if (active) return { request: active, started: true }

      const prepare = transaction.intent?.prepare
      if (!walletClient || !prepare)
        return { request: undefined, started: false }
      const prepared = fromThrowable(
        prepare,
        () => undefined,
      )({ walletClient, chainId }).unwrapOr(undefined)
      const request = prepared?.request
      return {
        request: request?.type === 'eoa' ? request : undefined,
        started: false,
      }
    })
