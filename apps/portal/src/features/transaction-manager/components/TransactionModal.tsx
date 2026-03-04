import { useState } from 'react'
import { match } from 'ts-pattern'
import { useConnection } from 'wagmi'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useTransactionModal } from '../hooks/useTransactionModal'
import type { Transaction, TransactionModalContentState } from '../types'
import { getTransactionById } from '../utils/getTransactionById'
import { TransactionInfoContent } from './TransactionInfoContent'
import { TransactionStateContent } from './TransactionStateContent'
import { TransactionsOverviewContent } from './TransactionsOverviewContent'

type TransactionModalProps = {
  transactions: Transaction[]
}

export const TransactionModal = ({ transactions }: TransactionModalProps) => {
  const { address } = useConnection()

  const { isOpen, closeModal } = useTransactionModal()

  const [transactionModalContentState, setTransactionModalContentState] =
    useState<TransactionModalContentState>({ type: 'overview' })

  const handleClose = () => {
    closeModal()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
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
              transaction={getTransactionById(
                transactions,
                state.transactionId,
              )}
              setTransactionModalContentState={setTransactionModalContentState}
            />
          ))
          .exhaustive()}
      </DialogContent>
    </Dialog>
  )
}
