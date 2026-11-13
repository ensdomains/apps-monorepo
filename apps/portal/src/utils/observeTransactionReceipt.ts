import { waitForTransaction } from '@ens-apps/transaction-manager'
import { waitForReceiptActor } from '@ens-apps/transaction-manager/actors/waitForReceipt.actor'
import { transactionManager } from '@ens-apps/transaction-manager/providers/transactionManager'
import type { TransactionReceipt } from 'viem'

type ReceiptObservation =
  | { readonly status: 'receipt'; readonly receipt: TransactionReceipt }
  | { readonly status: 'failed' }
  | { readonly status: 'unobserved' }

// Retain the actor and its client; a later attempt may reuse the manager's id.
export const observeTransactionReceipt = (
  txId: string,
  observe: (outcome: ReceiptObservation) => void,
  recoverBeforeHash: () => void = () => {},
): void => {
  const transaction = transactionManager.getTransaction(txId)
  if (!transaction) {
    observe({ status: 'unobserved' })
    return
  }
  let hasSettled = false
  let unsubscribe = () => {}
  const settle = (outcome: ReceiptObservation) => {
    if (hasSettled) return
    hasSettled = true
    unsubscribe()
    observe(outcome)
  }
  unsubscribe = transactionManager.onTransactionsChange(() => {
    if (transactionManager.getTransaction(txId) === transaction) return
    unsubscribe()
    const { hash, callsId } = transaction.getSnapshot().context
    if (!hash && !callsId) recoverBeforeHash()
  })
  void waitForTransaction(txId).then(
    ({ receipt }) =>
      settle(
        receipt ? { status: 'receipt', receipt } : { status: 'unobserved' },
      ),
    () => {
      const snapshot = transaction.getSnapshot()
      if (snapshot.matches({ error: 'cancelled' }))
        return settle({ status: 'unobserved' })
      if (snapshot.status !== 'stopped')
        return settle({
          status:
            snapshot.matches({ error: 'timeout' }) ||
            snapshot.matches({ error: 'unknown' }) ||
            snapshot.status === 'error'
              ? 'unobserved'
              : 'failed',
        })
      const { hash, callsId, publicClient } = snapshot.context
      if ((!hash && !callsId) || !publicClient)
        return settle({ status: 'unobserved' })
      // Stopping an actor cannot cancel a submitted transaction; observe only its receipt.
      void Promise.resolve()
        .then(() => waitForReceiptActor({ ...snapshot.context, publicClient }))
        .then(
          (result) => {
            if (result.isOk())
              return settle({ status: 'receipt', receipt: result.value })
            settle({
              status:
                result.error._tag === 'TransactionRevertedError'
                  ? 'failed'
                  : 'unobserved',
            })
          },
          () => settle({ status: 'unobserved' }),
        )
    },
  )
}
