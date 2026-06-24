import { getActiveSignedProfileImageUploads } from '@/features/profile/service/profileImageCache'
import type { PreparedProfileImageUpload } from '@/features/profile/service/profileImageUpload'
import type { ProfileRecords } from '@/features/profile/types'
import { createDiff } from '@/features/profile/utils/createDiff'
import { normalizeProfileRecords } from '@/features/profile/utils/transformRecords'

interface EditProfileDialogDraftStateParams {
  readonly preparedImageUploads: readonly PreparedProfileImageUpload[]
  readonly savedRecords: ProfileRecords
  readonly values: ProfileRecords
}

interface EditProfileDialogCloseActionParams {
  readonly confirmDiscard: () => boolean
  readonly hasUnsavedChanges: boolean
  readonly isSaving: boolean
}

type EditProfileDialogCloseAction = 'close' | 'keepOpen'

export const getEditProfileDialogDraftState = ({
  preparedImageUploads,
  savedRecords,
  values,
}: EditProfileDialogDraftStateParams) => {
  const submittedValues = normalizeProfileRecords(values)
  const diff = createDiff(savedRecords, submittedValues)
  const hasRecordChanges = Object.keys(diff).length > 0
  const activePreparedImageUploads = getActiveSignedProfileImageUploads({
    images: preparedImageUploads,
    records: submittedValues,
  })
  const hasPreparedImageUpload = activePreparedImageUploads.length > 0

  return {
    activePreparedImageUploads,
    hasPreparedImageUpload,
    hasRecordChanges,
    hasUnsavedChanges: hasRecordChanges || hasPreparedImageUpload,
    submittedValues,
  }
}

export const getEditProfileDialogHasUnsavedChanges = (
  params: EditProfileDialogDraftStateParams,
) => getEditProfileDialogDraftState(params).hasUnsavedChanges

export const getEditProfileDialogCloseAction = ({
  confirmDiscard,
  hasUnsavedChanges,
  isSaving,
}: EditProfileDialogCloseActionParams): EditProfileDialogCloseAction => {
  if (isSaving) {
    return 'keepOpen'
  }

  if (!hasUnsavedChanges) {
    return 'close'
  }

  return confirmDiscard() ? 'close' : 'keepOpen'
}
