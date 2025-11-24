import { Plus } from 'lucide-react'
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
import { Input } from '@/components/ui/input'

interface AddLinkDialogProps {
  buttonLabel?: string
  title?: string
  onAdd: (link: { name: string; url: string }) => void
}

export const AddLinkDialog = ({
  buttonLabel = 'Add Link',
  title = 'Add Link',
  onAdd,
}: AddLinkDialogProps) => {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  const resetState = () => {
    setName('')
    setUrl('')
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState()
    }
    setOpen(nextOpen)
  }

  const handleAdd = () => {
    const trimmedName = name.trim()
    const trimmedUrl = url.trim()

    if (!trimmedName || !trimmedUrl) return

    onAdd({ name: trimmedName, url: trimmedUrl })
    resetState()
    setOpen(false)
  }

  const canSubmit = name.trim().length > 0 && url.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="Personal Site"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Link"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} className="w-full" disabled={!canSubmit}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
