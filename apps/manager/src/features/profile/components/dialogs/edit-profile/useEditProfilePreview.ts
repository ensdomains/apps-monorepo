import { useLingui } from '@lingui/react/macro'
import { useBlocker } from '@tanstack/react-router'
import { useCallback, useEffect, useRef } from 'react'
import type { Actor } from 'xstate'
import { useSetProfileDraft } from '@/features/profile/components/view/ProfileDraft.context'
import type { editProfileDialogMachine } from './EditProfileDialog.machine'
import type { EditProfileSaveHandler } from './EditProfileDialog.types'

interface UseEditProfilePreviewParams {
  readonly dialogActor: Actor<typeof editProfileDialogMachine>
  readonly isPreviewing: boolean
  readonly onPublish: EditProfileSaveHandler
  readonly onReset: () => void
}

type PendingPublish = Parameters<EditProfileSaveHandler>

export const useEditProfilePreview = ({
  dialogActor,
  isPreviewing,
  onPublish,
  onReset,
}: UseEditProfilePreviewParams) => {
  const { t } = useLingui()
  const setDraft = useSetProfileDraft()
  const pendingPublishRef = useRef<PendingPublish | null>(null)

  useEffect(() => {
    if (!isPreviewing) setDraft(null)
  }, [isPreviewing, setDraft])

  useBlocker({
    disabled: !isPreviewing,
    enableBeforeUnload: isPreviewing,
    shouldBlockFn: () =>
      !confirm(
        t`You have unpublished changes. Are you sure you want to leave?`,
      ),
  })

  const handlePreview = useCallback<EditProfileSaveHandler>(
    (currentRecords, options) => {
      const previewUrlOf = (kind: 'avatar' | 'header') =>
        options.preparedImageUploads.find((upload) => upload.kind === kind)
          ?.dataURL

      pendingPublishRef.current = [currentRecords, options]
      setDraft({
        avatarPreviewUrl: previewUrlOf('avatar'),
        headerPreviewUrl: previewUrlOf('header'),
        records: currentRecords,
      })
      dialogActor.send({ type: 'PREVIEW' })
    },
    [dialogActor, setDraft],
  )

  const handlePublish = useCallback(() => {
    if (pendingPublishRef.current) onPublish(...pendingPublishRef.current)
  }, [onPublish])

  const handleCancelPreview = useCallback(() => {
    pendingPublishRef.current = null
    onReset()
    dialogActor.send({ type: 'CLOSE' })
  }, [dialogActor, onReset])

  const handleResumeEdit = useCallback(() => {
    dialogActor.send({ type: 'RESUME_EDIT' })
  }, [dialogActor])

  return {
    handleCancelPreview,
    handlePreview,
    handlePublish,
    handleResumeEdit,
  }
}
