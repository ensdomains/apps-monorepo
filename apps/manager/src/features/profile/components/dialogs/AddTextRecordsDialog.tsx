import { CircleCheck, Plus } from 'lucide-react'
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
import type { TextRecordDef } from '../../data/records/types'
import { IconRenderer } from '../IconRenderer'

interface AddTextRecordsDialogProps {
  buttonLabel: string
  title: string
  records: TextRecordDef[]
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
        <Button variant="secondary" size="sm" className="rounded-full">
          <Plus className="size-5" />
          {buttonLabel}
        </Button>
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
                  variant={isSelected ? 'default' : 'secondary'}
                  onClick={() => handleToggle(record.key)}
                  className="flex items-center gap-2 rounded-full"
                >
                  <IconRenderer icon={record.icon} className="size-4" />
                  <span>{record.name}</span>
                  {isSelected ? (
                    <CircleCheck className="size-4" />
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
