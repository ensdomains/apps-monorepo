import { useBlocker } from '@tanstack/react-router'
import { ArrowRight, Check, Loader2, Plus, Save, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  isSaving?: boolean
  isSuccess?: boolean
  errorMessage?: string
  txHash?: string
}

export const DiffDialog = ({
  name,
  originalData,
  currentData,
  onSave,
  isSaving,
  isSuccess,
  errorMessage,
  txHash,
}: DiffDialogProps) => {
  const [open, setOpen] = useState(false)
  const [baselineData, setBaselineData] = useState(originalData)
  const prevIsSuccessRef = useRef(isSuccess)

  useEffect(() => {
    setBaselineData(originalData)
  }, [originalData])

  useEffect(() => {
    const prevIsSuccess = prevIsSuccessRef.current
    if (!prevIsSuccess && isSuccess) {
      setBaselineData(JSON.parse(JSON.stringify(currentData)))
    }
    prevIsSuccessRef.current = isSuccess
  }, [isSuccess, currentData])

  const diff = useMemo(
    () => createDiff(baselineData, currentData),
    [baselineData, currentData],
  )
  const hasChanges = Object.keys(diff).length > 0
  const showSuccessState = Boolean(isSuccess && !hasChanges)

  useBlocker({
    shouldBlockFn: () => {
      if (!hasChanges || showSuccessState) return false

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
        <UpdateStatusPanel
          isSaving={isSaving}
          isSuccess={showSuccessState}
          errorMessage={errorMessage}
          txHash={txHash}
        />
        {!showSuccessState && (
          <div className="max-h-96 overflow-y-auto">
            {isSaving ? null : hasChanges ? (
              <div className="space-y-4">
                {Object.entries(diff).map(([key, change]) => (
                  <div key={key} className="rounded-lg border p-4">
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
                      <div className="rounded bg-green-50 p-2 text-green-700 text-sm">
                        <strong>New value:</strong>{' '}
                        {change.current || '(empty)'}
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
        )}
        <DialogFooter>
          {showSuccessState ? (
            <LinkButton
              to="/p/$name"
              params={{ name }}
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Go to Profile
            </LinkButton>
          ) : (
            <>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || Boolean(isSaving)}
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
