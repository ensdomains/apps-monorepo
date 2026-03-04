import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TransactionModalContentState } from '../types'

type TransactionStateContentProps = {
  setTransactionModalContentState: (state: TransactionModalContentState) => void
}

export const TransactionStateContent = ({
  setTransactionModalContentState,
}: TransactionStateContentProps) => {
  return (
    <DialogContent className="sm:max-w-[420px] space-y-3 transition-all duration-300">
      <DialogHeader>
        <DialogTitle>Transaction State</DialogTitle>
      </DialogHeader>
    </DialogContent>
  )
}
