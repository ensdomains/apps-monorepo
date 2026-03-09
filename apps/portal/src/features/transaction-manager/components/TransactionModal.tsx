import { useState } from 'react'
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

  const { isOpen, closeModal, clearTransaction } = useTransactionModal()

  const [transactionModalContentState, setTransactionModalContentState] =
    useState<TransactionModalContentState>({ type: 'overview' })

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
          'sm:max-w-[420px] space-y-3 transition-all duration-150',
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
              focusedTransactionId={state.transactionId}
              txState={txState}
              setTransactionModalContentState={setTransactionModalContentState}
            />
          ))
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
