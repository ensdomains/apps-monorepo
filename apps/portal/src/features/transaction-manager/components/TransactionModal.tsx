import { useActiveTransactions } from '@ens-apps/transaction-manager'
import { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import { useConnection } from 'wagmi'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useActiveTransactionState } from '../hooks/useActiveTransactionState'
import { useTransactionModal } from '../hooks/useTransactionModal'
import type { Transaction, TransactionModalContentState } from '../types'
import { getTransactionById } from '../utils/getTransactionById'
import { TransactionInfoContent } from './TransactionInfoContent'
import { TransactionStateContent } from './TransactionStateContent'
import { TransactionsOverviewContent } from './TransactionsOverviewContent'

type TransactionModalProps = {
  readonly transactions: readonly Transaction[]
}

export const TransactionModal = ({ transactions }: TransactionModalProps) => {
  const { address } = useConnection()
  const txState = useActiveTransactionState()
  const activeTransactionsMap = useActiveTransactions()

  const { isOpen, closeModal, clearTransaction } = useTransactionModal()
  const autoAdvanceTxId =
    isOpen && txState?.machineState === 'success' ? txState.txId : null

  const [transactionModalContentState, setTransactionModalContentState] =
    useState<TransactionModalContentState>({ type: 'overview' })

  // biome-ignore lint/correctness/useExhaustiveDependencies: `transactions` is intentionally omitted — callers pass an inline array that gets a new reference on every render, which would cause an infinite loop. This effect must only fire when a transaction actually completes (autoAdvanceTxId changes).
  useEffect(() => {
    if (!autoAdvanceTxId) return

    const activeIndex = transactions.findIndex(
      (tx) => tx.id === autoAdvanceTxId,
    )
    if (activeIndex < 0 || activeIndex >= transactions.length - 1) return

    transactions[activeIndex].onDone()
  }, [autoAdvanceTxId])

  const handleClose = () => {
    closeModal()
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose()
          // Only clear when transaction has failed - don't clear pending (tx may still be in wallet)
          // or success (user might want to reopen and see the result)
          if (txState?.error) {
            clearTransaction()
          }
        }
      }}
    >
      <DialogContent
        className={cn(
          'sm:max-w-[420px] max-h-[85vh] overflow-y-auto space-y-3 transition-all duration-150 pt-10',
          transactionModalContentState.type === 'info' && 'p-0 gap-0',
        )}
        showCloseButton={transactionModalContentState.type !== 'info'}
      >
        {match(transactionModalContentState)
          .with({ type: 'overview' }, () => (
            <TransactionsOverviewContent
              address={address}
              transactions={transactions}
              txState={txState}
              activeTransactionsMap={activeTransactionsMap}
              setTransactionModalContentState={setTransactionModalContentState}
            />
          ))
          .with({ type: 'info' }, (state) => (
            <TransactionInfoContent
              transaction={getTransactionById(
                transactions,
                state.transactionId,
              )}
              setTransactionModalContentState={setTransactionModalContentState}
            />
          ))
          .with({ type: 'state' }, (state) => (
            <TransactionStateContent
              transactions={transactions}
              activeTransactionId={state.transactionId}
              txState={txState}
              activeTransactionsMap={activeTransactionsMap}
              setTransactionModalContentState={setTransactionModalContentState}
            />
          ))
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
