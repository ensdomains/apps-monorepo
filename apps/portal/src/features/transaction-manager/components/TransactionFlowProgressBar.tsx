import type { TransactionMachineActor } from '@ens-apps/transaction-manager'
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { match } from 'ts-pattern'
import { cn } from '@/lib/utils'
import type { Transaction } from '../types'
import { getStatus } from '../utils/getStatus'
import { getProgressFraction } from './getProgressFraction'

type TransactionFlowProgressBarProps = {
  readonly transactions: readonly Transaction[]
  readonly activeTransactionsMap: Map<string, TransactionMachineActor>
}

// Bar padding + icon-wrapper padding + half the size-3.5 icon.
const ICON_CENTER_INSET_REM = 0.25 + 0.25 + 0.875 / 2

export const TransactionFlowProgressBar = ({
  transactions,
  activeTransactionsMap,
}: TransactionFlowProgressBarProps) => {
  const statuses = transactions.map((tx) =>
    getStatus(tx.id, activeTransactionsMap),
  )
  const progressFraction = getProgressFraction(statuses)
  const allSuccess = progressFraction === 1
  const hasError = statuses.includes('error')

  // Interior positions interpolate between icon centers, not the bar edges.
  const progressWidth = match(progressFraction)
    .with(0, () => '0%')
    .with(1, () => '100%')
    .otherwise(
      (fraction) =>
        `calc(${fraction * 100}% + ${ICON_CENTER_INSET_REM * (1 - fraction * 2)}rem)`,
    )

  const fillColor = match({ hasError, allSuccess })
    .with({ hasError: true }, () => 'bg-garnet-100')
    .with({ allSuccess: true }, () => 'bg-peridot-100')
    .otherwise(() => 'bg-muted')

  return (
    <div
      className={cn(
        'relative flex justify-between gap-1 rounded-full w-full h-8 p-1 items-center overflow-hidden',
        'bg-accent',
        allSuccess && 'text-peridot-900',
      )}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-full transition-all duration-300 h-full',
          fillColor,
        )}
        style={{ width: progressWidth }}
      />
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className="relative z-10 flex shrink-0 items-center rounded-full p-1"
        >
          <ArrowRight className="size-3.5 shrink-0" />
        </div>
      ))}
      <div className="relative z-10 flex shrink-0 items-center rounded-full p-1">
        {hasError ? (
          <XCircle className="size-3.5 shrink-0" />
        ) : (
          <CheckCircle2 className="size-3.5 shrink-0" />
        )}
      </div>
    </div>
  )
}
