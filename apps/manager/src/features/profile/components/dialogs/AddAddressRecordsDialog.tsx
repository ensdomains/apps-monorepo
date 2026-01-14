import { Check, Plus } from 'lucide-react'
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

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button className="rounded-full" size="sm" variant="secondary">
          <Plus className="size-5" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {records.length > 0 ? (
          <div className="flex flex-wrap gap-2 overflow-y-auto">
            {records.map((record) => {
              const isSelected = selectedCoinTypes.includes(record.coinType)
              return (
                <Button
                  className="flex min-w-fit max-w-1/2 flex-1 items-center gap-2"
                  key={record.coinType}
                  onClick={() => handleToggle(record.coinType)}
                  variant={isSelected ? 'default' : 'outline'}
                >
                  <IconRenderer className="size-4" icon={record.icon} />
                  <span>{record.name}</span>
                  {isSelected ? (
                    <Check className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                </Button>
              )
            })}
          </div>
        ) : (
          <p>No more records to add</p>
        )}
        <DialogFooter>
          <Button
            className="w-full"
            disabled={selectedCoinTypes.length === 0}
            onClick={handleAdd}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
