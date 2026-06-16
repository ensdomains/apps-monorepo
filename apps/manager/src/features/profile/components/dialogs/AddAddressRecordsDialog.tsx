import { Trans } from '@lingui/react/macro'
import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import type { AddressRecordDef } from '../../data/records/types'
import { IconRenderer } from '../IconRenderer'

interface AddAddressRecordsDialogProps {
  buttonLabel: string
  title: string
  records: AddressRecordDef[]
  onAdd: (coinTypes: number[]) => void
}

export const AddAddressRecordsDialog = ({
  buttonLabel,
  title,
  records,
  onAdd,
}: AddAddressRecordsDialogProps) => {
  const [open, setOpen] = useState(false)
  const [selectedCoinTypes, setSelectedCoinTypes] = useState<number[]>([])
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const handleToggle = (coinType: number) => {
    setSelectedCoinTypes((prev) => {
      if (prev.includes(coinType)) {
        return prev.filter((k) => k !== coinType)
      }
      return [...prev, coinType]
    })
  }

  const handleAdd = () => {
    onAdd(selectedCoinTypes)
    setSelectedCoinTypes([])
    setOpen(false)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setSelectedCoinTypes([])
    }
  }

  const triggerButton = (
    <Button
      className="h-auto gap-2.75 py-1 pr-1 pl-0! text-muted-foreground text-sm hover:bg-transparent hover:text-muted-foreground"
      size="sm"
      variant="ghost"
    >
      <Plus className="size-4" />
      {buttonLabel}
    </Button>
  )

  const content =
    records.length > 0 ? (
      <div className="flex flex-wrap justify-center gap-3">
        {records.map((record) => {
          const isSelected = selectedCoinTypes.includes(record.coinType)
          return (
            <Button
              className={cn(
                'flex w-auto items-center gap-2 rounded-full',
                isSelected
                  ? 'bg-neutral-600 text-neutral-300 hover:bg-neutral-500 hover:text-neutral-200'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              key={record.coinType}
              onClick={() => handleToggle(record.coinType)}
              variant={isSelected ? 'ghost' : 'secondary'}
            >
              <IconRenderer className="size-4" icon={record.icon} />
              <span>{record.name}</span>
              {isSelected ? (
                <Minus className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
            </Button>
          )
        })}
      </div>
    ) : (
      <p>
        <Trans>No more records to add</Trans>
      </p>
    )

  const addButton = (
    <Button
      className="w-full"
      disabled={selectedCoinTypes.length === 0}
      onClick={handleAdd}
    >
      Add
    </Button>
  )

  if (isDesktop) {
    return (
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">{content}</div>
          <DialogFooter className="pt-2">{addButton}</DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer onOpenChange={handleOpenChange} open={open}>
      <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[60vh] overflow-y-auto px-4">{content}</div>
        <DrawerFooter>{addButton}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
