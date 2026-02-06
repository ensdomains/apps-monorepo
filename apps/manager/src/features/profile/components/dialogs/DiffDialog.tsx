import { useBlocker } from '@tanstack/react-router'
import { ArrowRight, Check, Loader2, Plus, Save, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button, LinkButton } from '@/components/ui/button'
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
import { UpdateStatusPanel } from './UpdateStatusPanel'

interface DiffDialogProps {
  name: string
  originalData: ProfileRecords
  currentData: ProfileRecords
  onSave: () => void
  onReset?: () => void
  isSaving?: boolean
  isSuccess?: boolean
  errorMessage?: string
  txHash?: string
  validationIssues?: Array<{
    sectionKey?: string
    fieldKey?: string
    message: string
  }>
}

export const DiffDialog = ({
  name,
  originalData,
  currentData,
  onSave,
  onReset,
  isSaving,
  isSuccess,
  errorMessage,
  txHash,
  validationIssues,
}: DiffDialogProps) => {
  const [open, setOpen] = useState(false)

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      onReset?.()
    }
    setOpen(isOpen)
  }
  const diff = useMemo(
    () => createDiff(originalData, currentData),
    [originalData, currentData],
  )
  const hasChanges = Object.keys(diff).length > 0

  useBlocker({
    shouldBlockFn: () => {
      if (!hasChanges || isSuccess) return false

      const shouldLeave = confirm(
        'You have unsaved changes. Are you sure you want to leave?',
      )
      return !shouldLeave
    },
  })

  const handleSave = () => {
    onSave()
  }

  const handleCancel = () => {
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

  const issuesByField =
    validationIssues?.reduce<Record<string, string[]>>((acc, issue) => {
      const sectionKey = issue.sectionKey ?? ''
      const fieldKey = issue.fieldKey ?? ''

      if (!sectionKey || !fieldKey) return acc

      const key = `${sectionKey}:${fieldKey}`

      if (!acc[key]) {
        acc[key] = []
      }

      acc[key]?.push(issue.message)

      return acc
    }, {}) ?? {}

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
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
        <UpdateStatusPanel
          errorMessage={errorMessage}
          hasValidationIssues={Boolean(validationIssues?.length)}
          isSaving={isSaving}
          isSuccess={isSuccess}
          txHash={txHash}
        />
        {!isSuccess && (
          <div className="max-h-96 overflow-y-auto">
            {isSaving ? null : hasChanges ? (
              <div className="space-y-4">
                {Object.entries(diff).map(([key, change]) => (
                  <div className="rounded-lg border p-4" key={key}>
                    <div className="mb-2 flex items-center gap-2">
                      {getChangeIcon(change.type)}
                      <span className="flex items-center gap-1 font-medium">
                        {change.sectionLabel && change.fieldLabel ? (
                          <>
                            <span>{change.sectionLabel}</span>
                            <ArrowRight className="size-3 text-gray-400" />
                            <span>{change.fieldLabel}</span>
                          </>
                        ) : (
                          key
                        )}
                      </span>
                      <Badge variant="outline">
                        {getChangeLabel(change.type)}
                      </Badge>
                    </div>
                    {change.type === 'added' && (
                      <div className="break-words rounded bg-green-50 p-2 text-green-700 text-sm">
                        <strong>New value:</strong>{' '}
                        {change.current || '(empty)'}
                      </div>
                    )}
                    {change.type === 'removed' && (
                      <div className="break-words rounded bg-red-50 p-2 text-red-700 text-sm">
                        <strong>Removed:</strong> {change.original || '(empty)'}
                      </div>
                    )}
                    {change.type === 'modified' && (
                      <div className="space-y-2">
                        <div className="break-words rounded bg-red-50 p-2 text-red-700 text-sm">
                          <strong>From:</strong> {change.original || '(empty)'}
                        </div>
                        <div className="break-words rounded bg-green-50 p-2 text-green-700 text-sm">
                          <strong>To:</strong> {change.current || '(empty)'}
                        </div>
                      </div>
                    )}
                    {change.sectionKey && change.fieldKey
                      ? (issuesByField[
                          `${change.sectionKey}:${change.fieldKey}`
                        ] ??
                          null) && (
                          <div className="mt-3 space-y-1">
                            {issuesByField[
                              `${change.sectionKey}:${change.fieldKey}`
                            ]?.map((message, index) => (
                              <div
                                className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700 text-xs"
                                // biome-ignore lint/suspicious/noArrayIndexKey: error list is stable for this render
                                key={index}
                              >
                                {message}
                              </div>
                            ))}
                          </div>
                        )
                      : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500">No changes to save</p>
            )}
          </div>
        )}
        <DialogFooter>
          {isSuccess ? (
            <LinkButton
              className="w-full"
              onClick={() => setOpen(false)}
              params={{ name }}
              to="/p/$name"
            >
              Go to Profile
            </LinkButton>
          ) : (
            <>
              <Button onClick={handleCancel} variant="outline">
                Cancel
              </Button>
              <Button
                disabled={!hasChanges || Boolean(isSaving)}
                onClick={handleSave}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 size-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
