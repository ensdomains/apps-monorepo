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
    </DialogContent>
  )
}
