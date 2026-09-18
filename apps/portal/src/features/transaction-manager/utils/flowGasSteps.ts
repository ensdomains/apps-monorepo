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
export const prepareUnpaidStepRequests = ({
  transactions,
  isSettled,
  walletClient,
  chainId,
}: {
  readonly transactions: readonly Transaction[]
  readonly isSettled: (id: string) => boolean
  readonly walletClient: WalletClientWithAccount | undefined
  readonly chainId: number
}): readonly (EOATransactionRequest | undefined)[] =>
  transactions
    .filter((transaction) => !isSettled(transaction.id))
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
