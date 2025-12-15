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
    setNameError(validateLinkName(value))
  }

  const handleUrlChange = (value: string) => {
    setUrl(value)
    setUrlError(validateLinkUrl(value))
  }

  const canSubmit =
    name.trim().length > 0 && url.trim().length > 0 && !nameError && !urlError

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
            onChange={(e) => handleNameChange(e.target.value)}
            errorText={nameError ?? undefined}
          />
          <Input
            label="Link"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            errorText={urlError ?? undefined}
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
