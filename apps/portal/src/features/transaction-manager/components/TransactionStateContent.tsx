import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { match } from 'ts-pattern'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction, TransactionModalContentState } from '../types'
import { getTransactionStatus } from '../utils/getTrasactionStatus'

type TransactionStateContentProps = {
  transaction: Transaction
  setTransactionModalContentState: (state: TransactionModalContentState) => void
}

export const TransactionStateContent = ({
  transaction,
  setTransactionModalContentState,
}: TransactionStateContentProps) => {
  const txState = useActiveTransactionState()

  const transactionStatus = getTransactionStatus(txState, transaction)

  return (
    <>
      <DialogHeader>
        <DialogTitle>{transaction.title}</DialogTitle>
      </DialogHeader>
      <div className="flex gap-4 justify-between rounded-full w-full bg-accent h-8">
        <ArrowRight className="size-8 p-2 bg-quartz-100 rounded-full" />
        <CheckCircle2 className="size-8 p-2 rounded-full" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 border border-border rounded-lg p-3.5">
          <ArrowRight className="size-5" />
          {transaction.transactionName}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setTransactionModalContentState({ type: 'overview' })}
        >
          <ArrowLeft className="size-4" />
        </Button>
        {match(transactionStatus)
          .with(undefined, () => (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={transaction.onStart}
            >
              Open wallet
            </Button>
          ))
          .with('success', () => (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={transaction.onDone}
            >
              Done
            </Button>
          ))
          .with('error', () => (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={transaction.onRetry}
            >
              Try again
            </Button>
          ))
          .otherwise(() => (
            <Button variant="secondary" className="flex-1" disabled>
              Waiting...
            </Button>
          ))}
      </div>
    </>
  )
}
