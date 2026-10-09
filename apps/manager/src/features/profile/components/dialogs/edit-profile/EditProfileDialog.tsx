import { Trans } from '@lingui/react/macro'
import { useActorRef, useSelector } from '@xstate/react'
import { ResolverSetupConfirmDialog } from '@/features/profile/components/dialogs/ResolverSetupConfirmDialog'
import { useAppForm } from '../../form'
import { EditProfileDialogProvider } from './EditProfileDialog.context'
import { editProfileDialogMachine } from './EditProfileDialog.machine'
import type { EditProfileDialogProps } from './EditProfileDialog.types'
import { EditProfileDialogBody } from './EditProfileDialogBody'
import { EditProfileFloatingBar } from './EditProfileFloatingBar'
import { EditProfilePreviewActions } from './EditProfilePreviewActions'
import { useEditProfileDialogSave } from './useEditProfileDialogSave'
import { useEditProfilePreview } from './useEditProfilePreview'

export const EditProfileDialog = ({
  name,
  records,
  owner,
  onUpdated,
  editButtonClassName,
  leftActions,
}: EditProfileDialogProps) => {
  const dialogActor = useActorRef(editProfileDialogMachine, {
    input: { records },
  })
  const isActive = useSelector(dialogActor, (state) => !state.matches('closed'))
  const isPreviewing = useSelector(
    dialogActor,
    (state) => state.context.isPreviewing,
  )
  const open = isActive && !isPreviewing
  const savedRecords = useSelector(
    dialogActor,
    (state) => state.context.savedRecords,
  )
  const isSaving = useSelector(dialogActor, (state) =>
    state.matches({ editing: 'saving' }),
  )
  const isSuccess = useSelector(dialogActor, (state) =>
    state.matches({ editing: 'success' }),
  )
  const ethAddressChanged = useSelector(
    dialogActor,
    (state) => state.context.ethAddressChanged,
  )

  const form = useAppForm({
    defaultValues: records,
  })

  const {
    confirmSetupSave,
    handleSave,
    handleImageUploadPrepared,
    handleSetupConfirmOpenChange,
    isFinalizingImageSave,
    isResolverAccessPending,
    resetPreparedImageSaveState,
    preparedImageUploads,
    setupConfirmOpen,
  } = useEditProfileDialogSave({
    dialogActor,
    ethAddressChanged,
    form,
    isSuccess,
    name,
    onUpdated,
    open: isActive,
    owner,
    savedRecords,
  })

  const {
    handleCancelPreview,
    handlePreview,
    handlePublish,
    handleResumeEdit,
  } = useEditProfilePreview({
    dialogActor,
    isPreviewing,
    onPublish: handleSave,
    onReset: resetPreparedImageSaveState,
  })

  const handleOpen = () => {
    resetPreparedImageSaveState()
    form.reset(records)
    dialogActor.send({ type: 'OPEN', records })
  }

  const handleClose = () => {
    if (isSaving) return

    resetPreparedImageSaveState()
    dialogActor.send({ type: 'CLOSE' })
  }

  return (
    <>
      <EditProfileFloatingBar
        isOpen={open}
        leftActions={isPreviewing ? undefined : leftActions}
        onEscape={handleClose}
        rightActions={
          isPreviewing ? (
            <EditProfilePreviewActions
              isPublishDisabled={isResolverAccessPending}
              isPublishing={isSaving || isSuccess || isFinalizingImageSave}
              onDiscard={handleCancelPreview}
              onEdit={handleResumeEdit}
              onPublish={handlePublish}
            />
          ) : (
            <button
              className={editButtonClassName}
              onClick={handleOpen}
              type="button"
            >
              <span className="lg:landscape:hidden">
                <Trans>Edit</Trans>
              </span>
              <span className="hidden lg:landscape:inline">
                <Trans>Edit Profile</Trans>
              </span>
            </button>
          )
        }
      >
        <EditProfileDialogProvider actor={dialogActor}>
          <EditProfileDialogBody
            form={form}
            isFinalizingImageSave={isFinalizingImageSave}
            isResolverAccessPending={isResolverAccessPending}
            name={name}
            onCancel={handleClose}
            onImageUploadPrepared={handleImageUploadPrepared}
            onPreview={handlePreview}
            open={open}
            owner={owner}
            preparedImageUploads={preparedImageUploads}
            savedRecords={savedRecords}
          />
        </EditProfileDialogProvider>
      </EditProfileFloatingBar>

      <ResolverSetupConfirmDialog
        intent="edit-profile"
        onConfirm={confirmSetupSave}
        onOpenChange={handleSetupConfirmOpenChange}
        open={setupConfirmOpen}
      />
    </>
  )
}
