import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TransactionModalContentState } from '../types'

type TransactionInfoContentProps = {
  setTransactionModalContentState: (state: TransactionModalContentState) => void
}

export const TransactionInfoContent = ({
  setTransactionModalContentState,
}: TransactionInfoContentProps) => {
  return (
    <DialogContent className="sm:max-w-[420px] space-y-3 transition-all duration-300">
      <DialogHeader>
        <DialogTitle>Transaction Info</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-medium">Transaction Info</h3>
          <p className="text-sm text-muted-foreground">
            The current state of the transaction.
          </p>
          <div className="flex flex-col gap-2">
            <h4 className="text-base font-medium">Transaction ID</h4>
            <p className="text-sm text-muted-foreground">
              The current state of the transaction.
            </p>
          </div>
        </div>
      </div>
    </DialogContent>
  )
}
