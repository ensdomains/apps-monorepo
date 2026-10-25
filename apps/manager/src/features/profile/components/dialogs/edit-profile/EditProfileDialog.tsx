import { Trans } from '@lingui/react/macro'
import { useMutation } from '@tanstack/react-query'
import { useActorRef, useSelector } from '@xstate/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ResolverSetupConfirmDialog } from '@/features/profile/components/dialogs/ResolverSetupConfirmDialog'
import type { ResolverCopySource } from '@/features/profile/service/resolverImport'
import {
  importResolverRecords,
  type ResolverImport,
} from '@/features/profile/service/resolverImport'
import { createResolverImportDraft } from '@/features/profile/service/resolverImportDraft'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
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
  resolverCopySource,
  canEditNormal = true,
  canStartEdit = true,
}: EditProfileDialogProps) => {
  const [resolverImport, setResolverImport] = useState<
    ResolverImport | undefined
  >()
  const [resolverSetupSource, setResolverSetupSource] = useState<
    ResolverCopySource | undefined
  >()
  const resolverPreparationSource =
    resolverImport?.source ?? resolverSetupSource
  const importMutation = useMutation({
    mutationFn: () => {
      if (!resolverCopySource)
        throw new Error(
          'Resolver replacement is not available. Refresh the profile and try again.',
        )
      return importResolverRecords(name, resolverCopySource)
    },
  })
  const dialogActor = useActorRef(editProfileDialogMachine, {
    input: { name, records },
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
    recheckResolverAccess,
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
    resolverCopySource: resolverPreparationSource,
    resolverImport,
    canSave:
      canStartEdit &&
      !resolverImport?.blockedKeys.length &&
      !importMutation.isPending &&
      (canEditNormal || Boolean(resolverPreparationSource)),
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

  const handleOpen = async (copy = false) => {
    resetPreparedImageSaveState()
    setResolverImport(undefined)
    setResolverSetupSource(undefined)
    if (!copy) {
      form.reset(records)
      dialogActor.send({ type: 'OPEN', name, records })
      return
    }
    if (resolverCopySource?.kind === 'setup') {
      const initialRecords = newEmptyProfileRecords()
      setResolverSetupSource(resolverCopySource)
      form.reset(initialRecords)
      dialogActor.send({ type: 'OPEN', name, records: initialRecords })
      return
    }
    try {
      const imported = await importMutation.mutateAsync()
      const importedDraft = createResolverImportDraft(imported.records)
      setResolverImport(imported)
      form.reset(importedDraft)
      dialogActor.send({ type: 'OPEN', name, records: importedDraft })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not import resolver records. Please try again.',
      )
    }
  }

  const handleClose = () => {
    if (isSaving) return

    resetPreparedImageSaveState()
    dialogActor.send({ type: 'CLOSE' })
  }

  const handleRetryImport = async () => {
    try {
      const imported = await importMutation.mutateAsync()
      setResolverImport(imported)
      const importedDraft = createResolverImportDraft(imported.records)
      form.reset(importedDraft)
      dialogActor.send({ type: 'CLOSE' })
      dialogActor.send({ type: 'OPEN', name, records: importedDraft })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not import resolver records. Please retry.',
      )
    }
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
          ) : canStartEdit ? (
            <div className="flex items-center gap-3">
              {canEditNormal && resolverCopySource ? (
                <Button
                  className={editButtonClassName}
                  disabled={importMutation.isPending}
                  onClick={() => void handleOpen(true)}
                  type="button"
                  variant="outline"
                >
                  {resolverCopySource.kind === 'setup' ? (
                    <Trans>Set up resolver</Trans>
                  ) : (
                    <Trans>Upgrade resolver</Trans>
                  )}
                </Button>
              ) : null}
              <Button
                className={editButtonClassName}
                disabled={importMutation.isPending}
                onClick={() => void handleOpen(!canEditNormal)}
                type="button"
                variant="blue"
              >
                {importMutation.isPending ? (
                  <Trans>Importing records…</Trans>
                ) : canEditNormal ? (
                  <>
                    <span className="xl:hidden">
                      <Trans>Edit</Trans>
                    </span>
                    <span className="hidden xl:inline">
                      <Trans>Edit Profile</Trans>
                    </span>
                  </>
                ) : resolverCopySource?.kind === 'setup' ? (
                  <Trans>Set up resolver</Trans>
                ) : (
                  <Trans>Copy & edit records</Trans>
                )}
              </Button>
            </div>
          ) : null
        }
      >
        <EditProfileDialogProvider actor={dialogActor}>
          <EditProfileDialogBody
            form={form}
            importBlockedKeys={resolverImport?.blockedKeys}
            importWarnings={resolverImport?.warnings}
            isFinalizingImageSave={isFinalizingImageSave}
            isImportPending={importMutation.isPending}
            isResolverAccessPending={
              isResolverAccessPending &&
              !resolverImport?.blockedKeys.length &&
              !importMutation.isPending
            }
            name={name}
            onCancel={handleClose}
            onImageUploadPrepared={handleImageUploadPrepared}
            onPreview={handlePreview}
            onRecheckPermissions={recheckResolverAccess}
            onRetryImport={() => void handleRetryImport()}
            open={open}
            owner={owner}
            preparedImageUploads={preparedImageUploads}
            requiresResolverPreparation={Boolean(resolverPreparationSource)}
            savedRecords={savedRecords}
          />
        </EditProfileDialogProvider>
      </EditProfileFloatingBar>

      <ResolverSetupConfirmDialog
        intent="edit-profile"
        isReplacing={Boolean(savedRecords.resolverAddress)}
        onConfirm={confirmSetupSave}
        onOpenChange={handleSetupConfirmOpenChange}
        open={setupConfirmOpen}
      />
    </>
  )
}
