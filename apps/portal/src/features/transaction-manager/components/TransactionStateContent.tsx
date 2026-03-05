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
import { getTransactionStatus } from '../utils/getTransactionStatus'

type TransactionStateContentProps = {
  readonly transaction: Transaction
  readonly txState: ActiveTransactionState | undefined
  readonly setTransactionModalContentState: (
    state: TransactionModalContentState,
  ) => void
}

export const TransactionStateContent = ({
  transaction,
  txState,
  setTransactionModalContentState,
}: TransactionStateContentProps) => {
  const transactionStatus = getTransactionStatus(txState, transaction)
  const chainId = useChainId()

  const blockExplorerTxUrl = txState?.hash
    ? getBlockExplorerTxUrl(wagmiConfig.chains, chainId, txState.hash)
    : undefined

  return (
    <>
      <DialogHeader>
        <DialogTitle>{transaction.title}</DialogTitle>
      </DialogHeader>
      <div
        className={cn(
          'flex justify-between rounded-full w-full h-8',
          match(transactionStatus)
            .with('success', () => 'bg-peridot-100')
            .otherwise(() => 'bg-accent'),
        )}
      >
        <button
          type="button"
          className={cn(
            'p-2 rounded-full flex items-center justify-start',
            'bg-quartz-100',
            match(transactionStatus)
              .with(undefined, () => 'bg-quartz-100')
              .with('success', () => 'bg-peridot-100 w-full')
              .with('error', () => 'bg-garnet-100')
              .otherwise(() => 'bg-quartz-100 w-1/2'),
          )}
        >
          <ArrowRight className="size-4" />
        </button>
        <button
          type="button"
          className="w-1/2 p-2 rounded-full flex items-center justify-end"
        >
          <CheckCircle2 className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4 border border-border rounded-lg p-3.5">
          <div className="mt-1">
            {match(transactionStatus)
              .with(undefined, () => <ArrowRight className="size-4" />)
              .with('success', () => <CheckCircle2 className="size-4" />)
              .with('error', () => <XCircle className="size-4" />)
              .otherwise(() => (
                <Hourglass className="size-4" />
              ))}
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <h3>{transaction.transactionName}</h3>
              {blockExplorerTxUrl && (
                <a
                  href={blockExplorerTxUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <SquareArrowOutUpRight className="size-3" />
                </a>
              )}
            </div>
            {txState?.error && (
              <TransactionErrorAlert
                title="Transaction Error"
                summary={txState.error?.message || 'An unknown error occurred.'}
                details={txState.error?.stack || 'No stack trace available.'}
                txHash={txState.hash as Hash | undefined}
                txHashLabel="Transaction hash:"
                showIcon={false}
              />
            )}
          </div>
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
        {match(transactionStatus)
          .with(undefined, () => (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={transaction.onStart}
            >
              Open wallet
            </Button>
          ))
          .with('success', () => (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={transaction.onDone}
            >
              Done
            </Button>
          ))
          .with('error', () => (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={transaction.onStart}
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
