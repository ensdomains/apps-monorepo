import { useActiveTransactions } from '@ens-apps/transaction-manager'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Hourglass,
  SquareArrowOutUpRight,
  XCircle,
} from 'lucide-react'
import { match } from 'ts-pattern'
import type { Hash } from 'viem'
import { useChainId } from 'wagmi'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TransactionErrorAlert } from '@/features/registry/components/TransactionErrorAlert'
import { cn } from '@/lib/utils'
import { wagmiConfig } from '@/lib/wagmi'
import { getBlockExplorerTxUrl } from '@/utils/blockExplorer/getBlockExplorerTxUrl'
import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction, TransactionModalContentState } from '../types'
import { getTransactionById } from '../utils/getTransactionById'
import {
  getTransactionStatus,
  getTransactionStatusInFlow,
} from '../utils/getTransactionStatus'

type TransactionStateContentProps = {
  readonly transactions: readonly Transaction[]
  readonly activeTransactionId: string
  readonly txState: ActiveTransactionState | undefined
  readonly setTransactionModalContentState: (
    state: TransactionModalContentState,
  ) => void
}

function getStatus(
  transactions: readonly Transaction[],
  transaction: Transaction,
  txState: ActiveTransactionState | undefined,
) {
  return transactions.length > 1
    ? getTransactionStatusInFlow(transactions, transaction, txState)
    : getTransactionStatus(txState, transaction)
}

export const TransactionStateContent = ({
  transactions,
  activeTransactionId,
  txState,
  setTransactionModalContentState,
}: TransactionStateContentProps) => {
  const chainId = useChainId()
  const activeTransactionsMap = useActiveTransactions()

  const activeTransaction = txState
    ? getTransactionById(transactions, txState.txId)
    : transactions[0]

  const allSuccess =
    transactions.length > 0 &&
    transactions.every((t) => getStatus(transactions, t, txState) === 'success')

  const hasError = transactions.some(
    (t) => getStatus(transactions, t, txState) === 'error',
  )

  const completedCount = transactions.filter(
    (t) => getStatus(transactions, t, txState) === 'success',
  ).length

  const activeIndex =
    txState !== undefined
      ? transactions.findIndex((t) => t.id === txState.txId)
      : -1

  const activeInProgress =
    activeIndex >= 0 &&
    completedCount === activeIndex &&
    getStatus(transactions, transactions[activeIndex], txState) !== 'success' &&
    getStatus(transactions, transactions[activeIndex], txState) !== 'error'

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

  const activeTxStatus = getStatus(transactions, activeTransaction, txState)

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {transactions.length === 1
            ? getTransactionById(transactions, activeTransactionId)?.title
            : 'Transaction flow'}
        </DialogTitle>
      </DialogHeader>

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

      <div className="flex flex-col gap-2">
        {transactions.map((transaction) => {
          const status = getStatus(transactions, transaction, txState)
          const isActive = txState?.txId === transaction.id
          const showError = isActive && txState?.error
          const hash = activeTransactionsMap.get(transaction.id)?.getSnapshot()
            ?.context?.hash

          const blockExplorerTxUrl = hash
            ? getBlockExplorerTxUrl(wagmiConfig.chains, chainId, hash)
            : undefined

          return (
            <div
              key={transaction.id}
              className={cn(
                'flex flex-start gap-4 border border-border rounded-lg p-3.5',
                isActive && 'ring-2 ring-ring/50',
              )}
            >
              <div className="mt-1 shrink-0">
                {match(status)
                  .with(undefined, () => (
                    <ArrowRight className="size-4 text-quartz-500" />
                  ))
                  .with('success', () => (
                    <CheckCircle2 className="size-4 text-peridot-600" />
                  ))
                  .with('error', () => (
                    <XCircle className="size-4 text-garnet-600" />
                  ))
                  .otherwise(() => (
                    <Hourglass className="size-4 text-quartz-600 animate-pulse" />
                  ))}
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-medium truncate">
                    {transaction.transactionName}
                  </h3>
                  {blockExplorerTxUrl && (
                    <a
                      href={blockExplorerTxUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="shrink-0"
                    >
                      <SquareArrowOutUpRight className="size-3" />
                    </a>
                  )}
                </div>
                {showError && txState?.error && (
                  <TransactionErrorAlert
                    title="Transaction Error"
                    summary={
                      txState.error?.message || 'An unknown error occurred.'
                    }
                    details={
                      txState.error?.stack || 'No stack trace available.'
                    }
                    txHash={txState.hash as Hash | undefined}
                    txHashLabel="Transaction hash:"
                    showIcon={false}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setTransactionModalContentState({ type: 'overview' })}
        >
          <ArrowLeft className="size-4" />
        </Button>
        {match(activeTxStatus)
          .with(undefined, () => (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={activeTransaction.onStart}
            >
              Open wallet
            </Button>
          ))
          .with('success', () => (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={activeTransaction.onDone}
            >
              Done
            </Button>
          ))
          .with('error', () => (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={activeTransaction.onStart}
            >
              Try again
            </Button>
          ))
          .otherwise(() => (
            <Button variant="ghost" className="flex-1 bg-quartz-100" disabled>
              Waiting...
            </Button>
          ))}
      </div>
    </>
  )
}
