import type { Address } from 'viem'
import type { PreparedProfileImageUpload } from '@/features/profile/service/profileImageUpload'
import type { ResolverCopySource } from '@/features/profile/service/resolverImport'
import type { ProfileRecords } from '@/features/profile/types'

export interface EditProfileForm {
  readonly reset: (records: ProfileRecords) => void
}

export interface EditProfileDialogProps {
  readonly name: string
  readonly records: ProfileRecords
  readonly owner?: Address
  readonly onUpdated?: () => undefined | Promise<unknown>
  readonly editButtonClassName: string
  readonly leftActions?: React.ReactNode
  readonly resolverCopySource?: ResolverCopySource
  readonly canEditNormal?: boolean
  readonly canStartEdit?: boolean
}

interface EditProfileSaveOptions {
  readonly hasRecordChanges: boolean
  readonly preparedImageUploads: readonly PreparedProfileImageUpload[]
}

export type EditProfileSaveHandler = (
  currentRecords: ProfileRecords,
  options: EditProfileSaveOptions,
) => void
