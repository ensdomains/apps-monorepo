import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Transaction, TransactionModalContentState } from '../types'

type TransactionInfoContentProps = {
  readonly transaction: Transaction
  readonly setTransactionModalContentState: (
    state: TransactionModalContentState,
  ) => void
}

export const TransactionInfoContent = ({
  transaction,
  setTransactionModalContentState,
}: TransactionInfoContentProps) => {
  return (
    <>
      <DialogHeader className="py-3 border-b mb-0">
        <DialogTitle className="flex items-center gap-1 text-base font-medium">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1"
            onClick={() =>
              setTransactionModalContentState({ type: 'overview' })
            }
          >
            <ArrowLeft className="size-3" /> Back
          </Button>
          {transaction.title}
        </DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex p-4 border-b items-start gap-2 rounded-lg">
          <ArrowRight className="size-5 mt-0.5" />
          <div className="space-y-0.5">
            <h3 className="text-base font-medium">
              {transaction.transactionName}
            </h3>
            <p className="text-xs font-mono">
              Est. cost: {transaction.estimatedGasCost} ETH
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
