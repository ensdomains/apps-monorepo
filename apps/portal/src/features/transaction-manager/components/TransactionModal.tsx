import { ListOrdered } from 'lucide-react'
import { Fragment, useState } from 'react'
import { useConnection, useEnsName } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { TransactionDetailsOverviewCard } from './TransactionDetailsOverviewCard'

export const TransactionModal = () => {
  const [open, setOpen] = useState(true)

  const { address } = useConnection()

  const { data: ensName, isLoading: isEnsNameLoading } = useEnsName({
    address,
    query: {
      enabled: Boolean(address),
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="fixed bottom-4 right-4 rounded-full">
          <ListOrdered className="size-4" />
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
            <TransactionDetailsOverviewCard />
            <Button className="w-full mb-0" variant="secondary">
              Start
            </Button>
          </Fragment>
        )}
      </DialogContent>
    </Dialog>
  )
}
