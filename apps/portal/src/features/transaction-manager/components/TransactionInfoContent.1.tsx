import type { TransactionInfoContentProps } from './TransactionInfoContent'

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
