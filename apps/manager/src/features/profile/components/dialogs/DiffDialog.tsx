import { Trans, useLingui } from '@lingui/react/macro'
import { useBlocker } from '@tanstack/react-router'
import { ArrowRight, Check, Loader2, Plus, Save, X } from 'lucide-react'
import type { ReactNode } from 'react'
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
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import type { ProfileRecords } from '@/features/profile/types'
import { createDiff } from '@/features/profile/utils/createDiff'
import { useMediaQuery } from '@/hooks/useMediaQuery'

const HEX_COLOR_REGEX = /^#[\da-f]{6}$/i

const useChangeLabels = () => {
  const { t } = useLingui()
  return {
    added: t`Added`,
    removed: t`Removed`,
    modified: t`Modified`,
  } as const
}

const DiffValue = ({ value }: { value: string | undefined }): ReactNode => {
  const display = value || <Trans>(empty)</Trans>
  if (value && HEX_COLOR_REGEX.test(value)) {
    return (
      <span className="inline-flex items-center gap-1.5 align-middle">
        <span
          className="size-3.5 shrink-0 rounded-sm border border-current/20"
          style={{ backgroundColor: value }}
        />
        {display}
      </span>
    )
  }
  return display
}

interface DiffDialogProps {
  name: string
  originalData: ProfileRecords
  currentData: ProfileRecords
  onSave: () => void
  onReset?: () => void
  canSubmit?: boolean
  isSaving?: boolean
  isSuccess?: boolean
  saveErrorMessage?: string
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
  canSubmit = true,
  isSaving,
  isSuccess,
  saveErrorMessage,
  validationIssues,
}: DiffDialogProps) => {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const changeLabels = useChangeLabels()

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
        t`You have unsaved changes. Are you sure you want to leave?`,
      )
      return !shouldLeave
    },
  })

  const changeIcons = {
    added: <Plus className="size-4 text-blue-600" />,
    removed: <X className="size-4 text-red-600" />,
    modified: <Check className="size-4 text-blue-600" />,
  } as const

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

  const triggerButton = (
    <Button className="w-full" disabled={!hasChanges || !canSubmit}>
      <Save className="mr-2 size-4" />
      <Trans>Save Changes</Trans>
    </Button>
  )

  const content = (
    <>
      {!isSuccess && (
        <div className="space-y-4">
          {!isSaving && saveErrorMessage ? (
            <div
              className="whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm"
              role="alert"
            >
              {saveErrorMessage}
            </div>
          ) : null}
          <div className="max-h-96 overflow-y-auto">
            {isSaving ? null : hasChanges ? (
              <div className="space-y-4">
                {Object.entries(diff).map(([key, change]) => (
                  <div className="rounded-lg border p-4" key={key}>
                    <div className="mb-2 flex items-center gap-2">
                      {changeIcons[change.type]}
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
                        {changeLabels[change.type]}
                      </Badge>
                    </div>
                    {change.type === 'added' && (
                      <div className="break-words rounded bg-blue-50 p-2 text-blue-700 text-sm">
                        <strong>
                          <Trans>New value:</Trans>
                        </strong>{' '}
                        <DiffValue value={change.current} />
                      </div>
                    )}
                    {change.type === 'removed' && (
                      <div className="break-words rounded bg-red-50 p-2 text-red-700 text-sm">
                        <strong>
                          <Trans>Removed:</Trans>
                        </strong>{' '}
                        <DiffValue value={change.original} />
                      </div>
                    )}
                    {change.type === 'modified' && (
                      <div className="space-y-2">
                        <div className="break-words rounded bg-red-50 p-2 text-red-700 text-sm">
                          <strong>
                            <Trans>From:</Trans>
                          </strong>{' '}
                          <DiffValue value={change.original} />
                        </div>
                        <div className="break-words rounded bg-blue-50 p-2 text-blue-700 text-sm">
                          <strong>
                            <Trans>To:</Trans>
                          </strong>{' '}
                          <DiffValue value={change.current} />
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
              <p className="text-center text-gray-500">
                <Trans>No changes to save</Trans>
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )

  const footer = isSuccess ? (
    <LinkButton
      className="w-full"
      onClick={() => setOpen(false)}
      params={{ name }}
      to="/$name"
    >
      <Trans>Go to Profile</Trans>
    </LinkButton>
  ) : (
    <>
      <Button onClick={() => setOpen(false)} variant="outline">
        <Trans>Cancel</Trans>
      </Button>
      <Button
        disabled={!hasChanges || !canSubmit || Boolean(isSaving)}
        onClick={onSave}
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            <Trans>Saving...</Trans>
          </>
        ) : (
          <>
            <Save className="mr-2 size-4" />
            <Trans>Save Changes</Trans>
          </>
        )}
      </Button>
    </>
  )

  if (isDesktop) {
    return (
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <Trans>Review Changes</Trans>
            </DialogTitle>
          </DialogHeader>
          {content}
          <DialogFooter>{footer}</DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer onOpenChange={handleOpenChange} open={open}>
      <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            <Trans>Review Changes</Trans>
          </DrawerTitle>
        </DrawerHeader>
        <div className="px-4">{content}</div>
        <DrawerFooter>{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
