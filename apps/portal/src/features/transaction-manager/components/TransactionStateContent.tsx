import { transactionManager } from '@ens-apps/transaction-manager'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
        <Button variant="secondary" className="flex-1">
          Open Wallet
        </Button>
      </div>
    </DialogContent>
  )
}
