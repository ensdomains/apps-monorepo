import { useState } from 'react'
import { match } from 'ts-pattern'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useActiveTransactionState } from '../hooks/useActiveTransactionState'
import { useTransactionModal } from '../hooks/useTransactionModal'
import type { Transaction, TransactionModalContentState } from '../types'
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

  const txState = useActiveTransactionState()

  const handleClose = () => {
    closeModal()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          variant="secondary"
          className={cn(
            'fixed inset-x-0 bottom-5 mx-auto w-fit',
            'opacity-0',
            'transition-all duration-300',
            txState && 'data-[state=closed]:opacity-100',
          )}
        >
          View Transaction In Progress...
        </Button>
      </DialogTrigger>
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
            transaction={transactions[state.index]}
            setTransactionModalContentState={setTransactionModalContentState}
          />
        ))
        .with({ type: 'state' }, (state) => (
          <TransactionStateContent
            transaction={transactions[state.index]}
            setTransactionModalContentState={setTransactionModalContentState}
          />
        ))
        .exhaustive()}
    </Dialog>
  )
}
