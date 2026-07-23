import type { TransactionMachineActor } from '@ens-apps/transaction-manager'
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  InfoIcon,
  PlayCircle,
  XCircle,
} from 'lucide-react'
import { Fragment } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useChainId, useEnsName } from 'wagmi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { cn } from '@/lib/utils'
import { wagmiConfig } from '@/lib/wagmi'
import { getBlockExplorerTxUrl } from '@/utils/blockExplorer/getBlockExplorerTxUrl'
import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction, TransactionModalContentState } from '../types'
import { getActiveTransaction } from '../utils/getActiveTransaction'
import { getStatus } from '../utils/getStatus'
import { EstimatedGasCost } from './EstimatedGasCost'
import { TransactionWaitCountdown } from './TransactionWaitCountdown'

type TransactionsOverviewContentProps = {
  readonly address: Address | undefined
  readonly transactions: readonly Transaction[]
  readonly txState: ActiveTransactionState | undefined
  readonly activeTransactionsMap: Map<string, TransactionMachineActor>
  readonly setTransactionModalContentState: (
    state: TransactionModalContentState,
  ) => void
}

export const TransactionsOverviewContent = ({
  address,
  transactions,
  txState,
  activeTransactionsMap,
  setTransactionModalContentState,
}: TransactionsOverviewContentProps) => {
  const chainId = useChainId()
  const { data: ensName, isLoading: isEnsNameLoading } = useEnsName({
    address,
    query: {
      enabled: Boolean(address),
    },
  })

  const activeTransaction = getActiveTransaction(transactions, txState)
  const activeIndex = transactions.findIndex(
    (t) => t.id === activeTransaction.id,
  )
  const hasNextTransaction =
    activeIndex >= 0 && activeIndex < transactions.length - 1

  const transactionStatus = getStatus(
    activeTransaction.id,
    activeTransactionsMap,
  )

  return (
    <>
      <DialogTitle className="sr-only">Transaction overview</DialogTitle>
      {isEnsNameLoading ? (
        <div className="flex flex-col items-center gap-4 pt-10">
          <Skeleton className="h-20 w-20 rounded-sm" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full mb-0" />
        </div>
      ) : (
        <Fragment>
          {ensName ? (
            <div className="flex flex-col items-center gap-2 pt-10">
              <NameAvatar name={ensName} height="80px" width="80px" />
              <h2 className="text-h2 text-foreground text-center max-w-full break-all">
                {ensName}
              </h2>
            </div>
          ) : null}
          <div className="space-y-2 min-w-0">
            {transactions.map((transaction) => {
              const activeTxSnapshot = activeTransactionsMap
                .get(transaction.id)
                ?.getSnapshot()

              const txHash = activeTxSnapshot?.context?.hash

              const blockExplorerTxUrl = txHash
                ? getBlockExplorerTxUrl(wagmiConfig.chains, chainId, txHash)
                : undefined

              return (
                // biome-ignore lint/a11y/useSemanticElements: div required - contains nested Button, cannot use button
                <div
                  key={transaction.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'flex flex-col gap-4 p-4 rounded-sm border min-w-0',
                    'border-border text-foreground cursor-pointer',
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
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <h4 className="text-base font-medium text-foreground truncate">
                          {transaction.title}
                        </h4>
                        {transaction.waitUntil &&
                        getStatus(transaction.id, activeTransactionsMap) ===
                          undefined &&
                        transaction.waitUntil > Date.now() ? (
                          <TransactionWaitCountdown
                            waitUntil={transaction.waitUntil}
                          />
                        ) : null}
                        {match(getStatus(transaction.id, activeTransactionsMap))
                          .with(undefined, () => (
                            <Badge variant="ghost" className="font-normal">
                              <PlayCircle className="size-3 mr-0.5" /> Not
                              Started
                            </Badge>
                          ))
                          .with('success', () =>
                            blockExplorerTxUrl ? (
                              <Badge
                                variant="success"
                                className="font-normal cursor-pointer hover:opacity-90"
                                asChild
                              >
                                <a
                                  href={blockExplorerTxUrl}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  className="inline-flex"
                                >
                                  <CheckCircle2 className="size-3 mr-0.5" />{' '}
                                  Done
                                  <ExternalLink className="size-3" />
                                </a>
                              </Badge>
                            ) : (
                              <Badge variant="success" className="font-normal">
                                <CheckCircle2 className="size-3 mr-0.5" /> Done
                              </Badge>
                            ),
                          )
                          .with('error', () => (
                            <Badge
                              variant="destructive"
                              className="font-normal"
                            >
                              <XCircle className="size-3 mr-0.5" /> Failed
                            </Badge>
                          ))
                          .otherwise(() => (
                            <Badge variant="warning" className="font-normal">
                              <PlayCircle className="size-3 mr-0.5" /> In
                              Progress
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
                        <EstimatedGasCost
                          actor={activeTransactionsMap.get(transaction.id)}
                          intent={transaction.intent}
                        />
                      </dd>
                    </dl>
                  </div>
                </div>
              )
            })}
          </div>
          <Button
            className="w-full mb-0"
            variant="default"
            onClick={() => {
              if (transactionStatus === 'success' && !hasNextTransaction) {
                activeTransaction.onDone()
                return
              }

              setTransactionModalContentState({
                type: 'state',
                transactionId: activeTransaction.id,
              })
            }}
          >
            {match(transactionStatus)
              .with(undefined, () => 'Start')
              .with('success', () => (hasNextTransaction ? 'Next' : 'Done'))
              .with('error', () => 'Retry')
              .otherwise(() => 'Next')}
          </Button>
        </Fragment>
      )}
    </>
  )
}
