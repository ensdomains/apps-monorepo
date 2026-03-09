import type { TransactionMachineActor } from '@ens-apps/transaction-manager'
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Transaction } from '../types'
import { getStatus } from '../utils/getStatus'

type TransactionFlowProgressBarProps = {
  readonly transactions: readonly Transaction[]
  readonly activeTransaction: Transaction
  readonly activeTransactionsMap: Map<string, TransactionMachineActor>
}

export const TransactionFlowProgressBar = ({
  transactions,
  activeTransaction,
  activeTransactionsMap,
}: TransactionFlowProgressBarProps) => {
  const allSuccess = transactions.every(
    (tx) => getStatus(tx.id, activeTransactionsMap) === 'success',
  )
  const hasError = transactions.some(
    (tx) => getStatus(tx.id, activeTransactionsMap) === 'error',
  )
  const completedCount = transactions.filter(
    (tx) => getStatus(tx.id, activeTransactionsMap) === 'success',
  ).length

  const activeTxStatus = getStatus(activeTransaction.id, activeTransactionsMap)

  const activeIndex = transactions.findIndex(
    (t) => t.id === activeTransaction.id,
  )

  const activeInProgress =
    activeIndex >= 0 &&
    completedCount === activeIndex &&
    activeTxStatus !== undefined &&
    activeTxStatus !== 'success' &&
    activeTxStatus !== 'error'

  const totalSegments = transactions.length + 1
  const filledSegments =
    completedCount + (activeInProgress ? 0.5 : 0) + (allSuccess ? 1 : 0)

  const progressPercent =
    totalSegments > 0 ? (filledSegments / totalSegments) * 100 : 0

  const fillColor = hasError
    ? 'bg-garnet-100'
    : allSuccess
      ? 'bg-peridot-100'
      : 'bg-quartz-100'

  return (
    <div
      className={cn(
        'relative flex justify-between gap-1 rounded-full w-full h-8 p-1 items-center overflow-hidden',
        'bg-accent',
      )}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-l-full transition-all duration-300 h-full',
          fillColor,
        )}
        style={{ width: `${progressPercent}%` }}
      />
      {transactions.map((transaction, index) => (
        <div
          key={transaction.id}
          className={cn(
            'relative z-10 flex flex-1 min-w-0 items-center rounded-full p-2',
            index === 0 ? 'justify-start' : 'justify-center',
          )}
        >
          <ArrowRight className="size-4 shrink-0" />
        </div>
      ))}
      <div className="relative z-10 flex flex-1 min-w-0 items-center justify-end rounded-full p-2">
        {hasError ? (
          <XCircle className="size-4 shrink-0" />
        ) : (
          <CheckCircle2 className="size-4 shrink-0" />
        )}
      </div>
    </div>
  )
}
