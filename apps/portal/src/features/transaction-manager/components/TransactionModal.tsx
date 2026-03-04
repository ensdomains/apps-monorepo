import { transactionManager } from '@ens-apps/transaction-manager'
import { Fragment, useState } from 'react'
import { useConnection, useEnsName } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { cn } from '@/lib/utils'
import { useActiveTransactionState } from '../hooks/useActiveTransactionState'
import { useTransactionModal } from '../hooks/useTransactionModal'
import { TransactionDetailsOverviewCard } from './TransactionDetailsOverviewCard'

type TransactionModalProps = {
  transactions: {
    title: string
    estimatedGasCost: number
    onStart: () => void
  }[]
}

export const TransactionModal = ({ transactions }: TransactionModalProps) => {
  const { address } = useConnection()

  const { isOpen, closeModal } = useTransactionModal()

  const [focusedTransaction, setFocusedTransaction] = useState<
    number | undefined
  >(undefined)

  const txState = useActiveTransactionState()

  const { data: ensName, isLoading: isEnsNameLoading } = useEnsName({
    address,
    query: {
      enabled: Boolean(address),
    },
  })

  const handleClose = () => {
    closeModal()
  }

  const handleRetry = () => {
    if (txState) {
      const actor = transactionManager.getTransaction(txState.txId)
      actor?.send({ type: 'RETRY' })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          variant="secondary"
          className={cn(
            'fixed inset-x-0 bottom-5 mx-auto w-fit',
            'opacity-0',
            'transition-all duration-300',
            txState && 'data-[state=closed]:opacity-100',
          )}
        >
          View Transaction In Progress...
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] space-y-3 transition-all duration-300">
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
            {transactions.map((transaction, index) => (
              <TransactionDetailsOverviewCard
                key={transaction.title}
                index={index}
                transaction={transaction}
                setFocusedTransaction={setFocusedTransaction}
              />
            ))}
            <Button
              className="w-full mb-0"
              variant="secondary"
              onClick={() => transactions[0]?.onStart()}
            >
              {focusedTransaction ? 'Starting...' : 'Start'}
            </Button>
          </Fragment>
        )}
      </DialogContent>
    </Dialog>
  )
}
