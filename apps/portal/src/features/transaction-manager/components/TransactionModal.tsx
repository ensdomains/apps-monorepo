import { transactionManager } from '@ens-apps/transaction-manager'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useActiveTransactionState } from '../hooks/useActiveTransactionState'
import { useTransactionModal } from '../hooks/useTransactionModal'
import type { TransactionModalContentState } from '../types'
import { TransactionInfoContent } from './TransactionInfoContent.1'
import { TransactionStateContent } from './TransactionStateContent'
import { TransactionsOverviewContent } from './TransactionsOverviewContent'

type TransactionModalProps = {
  transactions: {
    title: string
    estimatedGasCost: number
    onStart: () => void
  }[]
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

  const handleRetry = () => {
    if (txState) {
      const actor = transactionManager.getTransaction(txState.txId)
      actor?.send({ type: 'RETRY' })
    }
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
        .with(
          {
            type: 'info',
          },
          () => (
            <TransactionInfoContent
              transaction={transactions[transactionModalContentState.index]}
              setTransactionModalContentState={setTransactionModalContentState}
            />
          ),
        )
        .with({ type: 'state' }, () => (
          <TransactionStateContent
            setTransactionModalContentState={setTransactionModalContentState}
          />
        ))
        .exhaustive()}
    </Dialog>
  )
}
