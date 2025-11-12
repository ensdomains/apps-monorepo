import { useBlocker } from '@tanstack/react-router'
import { Check, Plus, Save, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { ProfileRecords } from '@/features/profile/types'
import { createDiff } from '@/features/profile/utils/createDiff'

interface DiffDialogProps {
  originalData: ProfileRecords
  currentData: ProfileRecords
  onSave: () => void
  onCancel: () => void
}

export const DiffDialog = ({
  originalData,
  currentData,
  onSave,
  onCancel,
}: DiffDialogProps) => {
  const [open, setOpen] = useState(false)
  const diff = useMemo(
    () => createDiff(originalData, currentData),
    [originalData, currentData],
  )
  const hasChanges = Object.keys(diff).length > 0

  useBlocker({
    shouldBlockFn: () => {
      if (!hasChanges) return false

      const shouldLeave = confirm(
        'You have unsaved changes. Are you sure you want to leave?',
      )
      return !shouldLeave
    },
  })

  const handleSave = () => {
    onSave()
    setOpen(false)
  }

  const handleCancel = () => {
    onCancel()
    setOpen(false)
  }

  const getChangeIcon = (type: 'added' | 'removed' | 'modified') => {
    switch (type) {
      case 'added':
        return <Plus className="size-4 text-green-600" />
      case 'removed':
        return <X className="size-4 text-red-600" />
      case 'modified':
        return <Check className="size-4 text-blue-600" />
    }
  }

  const getChangeLabel = (type: 'added' | 'removed' | 'modified') => {
    switch (type) {
      case 'added':
        return 'Added'
      case 'removed':
        return 'Removed'
      case 'modified':
        return 'Modified'
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" disabled={!hasChanges}>
          <Save className="mr-2 size-4" />
          Save Changes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review Changes</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {hasChanges ? (
            <div className="space-y-4">
              {Object.entries(diff).map(([key, change]) => (
                <div key={key} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center gap-2">
                    {getChangeIcon(change.type)}
                    <span className="font-medium">{key}</span>
                    <Badge variant="outline">
                      {getChangeLabel(change.type)}
                    </Badge>
                  </div>
                  {change.type === 'added' && (
                    <div className="rounded bg-green-50 p-2 text-green-700 text-sm">
                      <strong>New value:</strong> {change.current || '(empty)'}
                    </div>
                  )}
                  {change.type === 'removed' && (
                    <div className="rounded bg-red-50 p-2 text-red-700 text-sm">
                      <strong>Removed:</strong> {change.original || '(empty)'}
                    </div>
                  )}
                  {change.type === 'modified' && (
                    <div className="space-y-2">
                      <div className="rounded bg-red-50 p-2 text-red-700 text-sm">
                        <strong>From:</strong> {change.original || '(empty)'}
                      </div>
                      <div className="rounded bg-green-50 p-2 text-green-700 text-sm">
                        <strong>To:</strong> {change.current || '(empty)'}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500">No changes to save</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
