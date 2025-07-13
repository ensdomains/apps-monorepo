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
import type { TextRecord } from '@/features/profile/types'

export type AddTextRecordsDialogProps = {
  buttonLabel: string
  title: string
  records: TextRecord[]
  onAdd: (keys: string[]) => void
}

export const AddTextRecordsDialog = ({
  buttonLabel,
  title,
  records,
  onAdd,
}: AddTextRecordsDialogProps) => {
  const [open, setOpen] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  const handleToggle = (key: string) => {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key)
      }
      return [...prev, key]
    })
  }

  const handleAdd = () => {
    onAdd(selectedKeys)
    setSelectedKeys([])
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
          <div className="flex flex-wrap justify-center gap-3">
            {records.map((record) => {
              const isSelected = selectedKeys.includes(record.key)
              return (
                <Button
                  key={record.key}
                  variant={isSelected ? 'default' : 'outline'}
                  onClick={() => handleToggle(record.key)}
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
            disabled={selectedKeys.length === 0}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
