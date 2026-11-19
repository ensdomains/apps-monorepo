import {
  type EditableRecord,
  type EditableTypes,
  hasDisallowedChanges,
} from '@/utils/records/editRecordUtils'
import { validateRecords } from '@/utils/records/validateRecord'
import {
  type PreparedRecordImage,
  submitStagedRecordImages,
} from './recordImageUpload'
import type { SaveRecordsTransactionParameters } from './saveRecords'

export type RecordSaveDraft = Readonly<
  Pick<SaveRecordsTransactionParameters, 'originalRecords' | 'pendingChanges'>
>

export const getRecordSaveEligibility = ({
  records,
  editableTypes,
  changesCount,
}: {
  readonly records: EditableRecord[]
  readonly editableTypes: EditableTypes
  readonly changesCount: number
}) => {
  const validationErrors = validateRecords(records)
  const hasPermissionChanges = hasDisallowedChanges(records, editableTypes)

  return {
    validationErrors,
    hasDisallowedChanges: hasPermissionChanges,
    canSave:
      changesCount > 0 &&
      validationErrors.length === 0 &&
      !hasPermissionChanges,
  }
}

type CurrentRecordSaveDraft = RecordSaveDraft & {
  readonly canSave: boolean
  readonly pendingImages: readonly PreparedRecordImage[]
}

export const isCurrentSavableDraft = (
  draft: RecordSaveDraft,
  current: CurrentRecordSaveDraft,
) =>
  current.canSave &&
  current.originalRecords === draft.originalRecords &&
  current.pendingChanges === draft.pendingChanges

export const canSubmitRecordSave = ({
  reviewId,
  activeReviewId,
  isWalletCurrent,
  draft,
  current,
}: {
  readonly reviewId: string
  readonly activeReviewId: string | undefined
  readonly isWalletCurrent: boolean
  readonly draft: RecordSaveDraft
  readonly current: CurrentRecordSaveDraft
}) =>
  reviewId === activeReviewId &&
  isWalletCurrent &&
  isCurrentSavableDraft(draft, current) &&
  current.pendingImages.length === 0

export const uploadImagesBeforeSaveReview = async ({
  uploads,
  submit,
  onUploaded,
  assertCurrent,
  openReview,
}: {
  readonly uploads: readonly PreparedRecordImage[]
  readonly submit: (upload: PreparedRecordImage) => Promise<void>
  readonly onUploaded: (upload: PreparedRecordImage) => void
  readonly assertCurrent: () => void
  readonly openReview: () => void
}) => {
  await submitStagedRecordImages({ uploads, submit, onUploaded, assertCurrent })
  assertCurrent()
  openReview()
}
