import { cn } from '@/lib/utils'
import type { ProfileImageKind } from './ProfileImageField.types'

export const MAX_FILE_SIZE_MB = 3
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export const fieldShellClassName =
  'rounded-sm border-[#d4d4d4] border-[0.5px] bg-white'

export const dropZoneClassName = cn(
  fieldShellClassName,
  'border-dashed bg-ens-quartz-50',
)

export const getEmptyLabel = (kind: ProfileImageKind) =>
  kind === 'avatar' ? 'Add a profile picture' : 'Add a banner image'

export const getRemoveLabel = (kind: ProfileImageKind) =>
  kind === 'avatar' ? 'Remove profile picture' : 'Remove banner image'

export const getTitle = (kind: ProfileImageKind) =>
  kind === 'avatar' ? 'profile picture' : 'banner image'
