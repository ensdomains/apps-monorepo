import { transactionManager } from '@ens-apps/transaction-manager'
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction, TransactionModalContentState } from '../types'

type TransactionStateContentProps = {
  transaction: Transaction
  setTransactionModalContentState: (state: TransactionModalContentState) => void
}

export const TransactionStateContent = ({
  transaction,
  setTransactionModalContentState,
}: TransactionStateContentProps) => {
  const txState = useActiveTransactionState()

  const handleRetry = () => {
    if (txState) {
      const actor = transactionManager.getTransaction(txState.txId)
      actor?.send({ type: 'RETRY' })
    }
  }

  return (
    <DialogContent className="sm:max-w-[420px] space-y-3 transition-all duration-300">
      <DialogHeader>
        <DialogTitle>{transaction.title}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-medium">Transaction State</h3>
          <p className="text-sm text-muted-foreground">
            The current state of the transaction.
          </p>
        </div>
      </div>
    </DialogContent>
  )
}
