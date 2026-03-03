import { ListOrdered } from 'lucide-react'
import { useState } from 'react'
import { useConnection, useEnsName } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { TransactionDetailsOverviewCard } from './TransactionDetailsOverviewCard'

export const TransactionModal = () => {
  const [open, setOpen] = useState(true)

  const { address } = useConnection()

  const { data: ensName } = useEnsName({
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
      <DialogContent className="sm:max-w-[420px]">
        <div className="flex flex-col items-center gap-2 pt-10 pb-4">
          <NameAvatar name={ensName as string} height="80px" width="80px" />
          <h2 className="text-3xl font-medium w-max text-quartz-900">
            {ensName}
          </h2>
        </div>
        <TransactionDetailsOverviewCard />
      </DialogContent>
    </Dialog>
  )
}
