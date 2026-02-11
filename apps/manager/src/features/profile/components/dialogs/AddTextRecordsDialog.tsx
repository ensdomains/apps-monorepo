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
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/useMediaQuery'
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
  const isDesktop = useMediaQuery('(min-width: 768px)')

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

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setSelectedKeys([])
    }
  }

  const triggerButton = (
    <Button
      className="h-auto gap-[11px] py-1 pr-1 pl-0! text-muted-foreground text-sm hover:bg-transparent hover:text-muted-foreground"
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
    )

  const addButton = (
    <Button
      className="w-full"
      disabled={selectedKeys.length === 0}
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
          {content}
          <DialogFooter>{addButton}</DialogFooter>
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
        <div className="px-4">{content}</div>
        <DrawerFooter>{addButton}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
