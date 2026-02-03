import { Plus } from 'lucide-react'
import { useState } from 'react'
import * as v from 'valibot'
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
import { staticTextRecords, textRecords } from '../../data/records'

const reservedTextRecordKeys = new Set<string>([
  ...staticTextRecords,
  ...textRecords.map((record) => record.key),
])

const linkUrlSchema = v.pipe(v.string(), v.trim(), v.url('Enter a valid URL'))

const validateLinkName = (name: string): string | null => {
  const trimmed = name.trim()

  if (!trimmed) {
    return 'Enter a name'
  }

  if (reservedTextRecordKeys.has(trimmed)) {
    return 'Choose a different name (reserved key)'
  }

  return null
}

const validateLinkUrl = (url: string): string | null => {
  const trimmed = url.trim()

  if (!trimmed) {
    return 'Enter a link'
  }

  const result = v.safeParse(linkUrlSchema, trimmed)

  if (!result.success) {
    const issue = result.issues[0]
    return issue?.message ?? 'Enter a valid URL'
  }

  return null
}

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
  const [nameError, setNameError] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)

  const resetState = () => {
    setName('')
    setUrl('')
    setNameError(null)
    setUrlError(null)
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

    const nextNameError = validateLinkName(trimmedName)
    const nextUrlError = validateLinkUrl(trimmedUrl)

    setNameError(nextNameError)
    setUrlError(nextUrlError)

    if (nextNameError || nextUrlError) return

    onAdd({ name: trimmedName, url: trimmedUrl })
    resetState()
    setOpen(false)
  }

  const handleNameChange = (value: string) => {
    setName(value)
    if (nameError) {
      setNameError(null)
    }
  }

  const handleUrlChange = (value: string) => {
    setUrl(value)
    if (urlError) {
      setUrlError(null)
    }
  }

  const canSubmit = name.trim().length > 0 && url.trim().length > 0

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
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
        <div className="space-y-4">
          <Input
            errorText={nameError ?? undefined}
            label="Name"
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Personal Site"
            value={name}
          />
          <Input
            errorText={urlError ?? undefined}
            label="Link"
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://example.com"
            value={url}
          />
        </div>
        <DialogFooter>
          <Button className="w-full" disabled={!canSubmit} onClick={handleAdd}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
