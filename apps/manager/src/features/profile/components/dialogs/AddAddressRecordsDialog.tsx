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
import type { AddressRecord } from '@/features/profile/types'

export type AddAddressRecordsDialogProps = {
  buttonLabel: string
  title: string
  records: AddressRecord[]
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{buttonLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {records.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {records.map((record) => {
              const isSelected = selectedCoinTypes.includes(record.coinType)
              return (
                <Button
                  key={record.coinType}
                  variant={isSelected ? 'default' : 'outline'}
                  onClick={() => handleToggle(record.coinType)}
                  className="flex items-center gap-2"
                >
                  {record.icon}
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
            onClick={handleAdd}
            className="w-full"
            disabled={selectedCoinTypes.length === 0}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
