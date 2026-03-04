import {
  ArrowRight,
  CheckCircle2,
  InfoIcon,
  PlayCircle,
  XCircle,
} from 'lucide-react'
import { Fragment } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { cn } from '@/lib/utils'
import { useActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction, TransactionModalContentState } from '../types'
import { getTransactionById } from '../utils/getTransactionById'
import { getTransactionStatus } from '../utils/getTrasactionStatus'

type TransactionsOverviewContentProps = {
  address: Address | undefined
  transactions: Transaction[]
  setTransactionModalContentState: (state: TransactionModalContentState) => void
}

export const TransactionsOverviewContent = ({
  address,
  transactions,
  setTransactionModalContentState,
}: TransactionsOverviewContentProps) => {
  const { data: ensName, isLoading: isEnsNameLoading } = useEnsName({
    address,
    query: {
      enabled: Boolean(address),
    },
  })

  const txState = useActiveTransactionState()

  const activeTransaction =
    txState && getTransactionById(transactions, txState.txId)

  return (
    <>
      {isEnsNameLoading || typeof ensName !== 'string' ? (
        <div className="flex flex-col items-center gap-4 pt-10">
          <Skeleton className="h-20 w-20 rounded-lg" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full mb-0" />
        </div>
      ) : (
        <Fragment>
          <div className="flex flex-col items-center gap-2 pt-10">
            <NameAvatar name={ensName} height="80px" width="80px" />
            <h2 className="text-3xl font-medium w-max text-quartz-900">
              {ensName}
            </h2>
          </div>
          {transactions.map((transaction) => (
            // biome-ignore lint/a11y/useSemanticElements: div required - contains nested Button, cannot use button
            <div
              key={transaction.title}
              role="button"
              tabIndex={0}
              className={cn(
                'flex flex-col gap-4 p-4 rounded-lg border',
                'border-border text-quartz-900 cursor-pointer',
              )}
              onClick={() =>
                setTransactionModalContentState({
                  type: 'state',
                  transactionId: transaction.id,
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setTransactionModalContentState({
                    type: 'state',
                    transactionId: transaction.id,
                  })
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-medium w-max text-quartz-900">
                      {transaction.title}
                    </h4>
                    {match(getTransactionStatus(txState, transaction))
                      .with(undefined, () => (
                        <Badge variant="ghost" className="font-normal">
                          <PlayCircle className="size-3 mr-0.5" /> Not Started
                        </Badge>
                      ))
                      .with('success', () => (
                        <Badge variant="success" className="font-normal">
                          <CheckCircle2 className="size-3 mr-0.5" /> Done
                        </Badge>
                      ))
                      .with('error', () => (
                        <Badge variant="destructive" className="font-normal">
                          <XCircle className="size-3 mr-0.5" /> Failed
                        </Badge>
                      ))
                      .otherwise(() => (
                        <Badge variant="warning" className="font-normal">
                          <PlayCircle className="size-3 mr-0.5" /> In Progress
                        </Badge>
                      ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setTransactionModalContentState({
                        type: 'info',
                        transactionId: transaction.id,
                      })
                    }}
                  >
                    <InfoIcon className="size-4" />
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
                <dl className="grid grid-cols-2 gap-1 place-items-start">
                  <dt className="text-base font-medium">Est. Cost</dt>
                  <dd className="text-base">
                    {transaction.estimatedGasCost} ETH
                  </dd>
                </dl>
              </div>
            </div>
          ))}
          <Button
            className="w-full mb-0"
            variant="secondary"
            onClick={() => activeTransaction?.onStart()}
          >
            {match(getTransactionStatus(txState, activeTransaction))
              .with(undefined, () => 'Start')
              .with('success', () => 'Done')
              .with('error', () => 'Retry')
              .otherwise(() => 'In Progress...')}
          </Button>
        </Fragment>
      )}
    </>
  )
}
