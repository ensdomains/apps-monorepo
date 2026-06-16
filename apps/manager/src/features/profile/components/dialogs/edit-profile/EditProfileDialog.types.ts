import type { Address } from 'viem'
import type { SignedProfileImageUpload } from '@/features/profile/service/profileImageCache'
import type { ProfileRecords } from '@/features/profile/types'
import type { useAppForm } from '../../form'

export type EditProfileForm = ReturnType<typeof useAppForm>

export interface EditProfileDialogProps {
  readonly name: string
  readonly records: ProfileRecords
  readonly owner?: Address
  readonly onUpdated?: () => undefined | Promise<unknown>
}

export interface EditProfileSaveOptions {
  readonly hasRecordChanges: boolean
  readonly signedImageUploads: readonly SignedProfileImageUpload[]
}

export type EditProfileSaveHandler = (
  currentRecords: ProfileRecords,
  options: EditProfileSaveOptions,
) => void
