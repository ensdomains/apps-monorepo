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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          className="h-auto gap-[11px] py-1 pr-1 pl-0! text-muted-foreground text-sm hover:bg-transparent hover:text-muted-foreground"
          size="sm"
          variant="ghost"
        >
          <Plus className="size-4" />
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
                  className="flex w-auto items-center gap-2 rounded-full"
                  key={record.key}
                  onClick={() => handleToggle(record.key)}
                  variant={isSelected ? 'default' : 'secondary'}
                >
                  <IconRenderer className="size-4" icon={record.icon} />
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
            className="w-full"
            disabled={selectedKeys.length === 0}
            onClick={handleAdd}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
