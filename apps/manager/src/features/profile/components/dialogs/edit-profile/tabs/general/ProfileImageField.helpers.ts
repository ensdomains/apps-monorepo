import { cn } from '@/lib/utils'
import type { ProfileImageKind } from './ProfileImageField.types'

export const MAX_FILE_SIZE_MB = 3
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

const UPLOAD_IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]

export const IMAGE_UPLOAD_ACCEPT = UPLOAD_IMAGE_TYPES.join(',')

export const getImageUploadError = (file: File): string | null => {
  // The upload service only stores JPEGs. SVGs must use a hosted URL to
  // preserve their vector format and avoid the bitmap cropper.
  if (file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name)) {
    return 'SVG uploads are not supported. Use "Enter manually" with an SVG image URL.'
  }

  if (!UPLOAD_IMAGE_TYPES.includes(file.type)) {
    return 'Please select a JPG, PNG, GIF, WebP, AVIF, BMP or ICO image'
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `Image must be under ${MAX_FILE_SIZE_MB}MB`
  }

  return null
}

export const fieldShellClassName =
  'rounded-sm border border-ens-quartz-250 bg-white'

export const focusVisibleRingClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-lapis-500 focus-visible:ring-offset-2'

export const dropZoneClassName = cn(
  fieldShellClassName,
  'border-dashed bg-ens-quartz-50',
)

export const getEmptyLabel = (kind: ProfileImageKind) =>
  kind === 'avatar' ? 'Add a profile picture' : 'Add a banner image'

export const getChangeLabel = (kind: ProfileImageKind) =>
  kind === 'avatar' ? 'Change profile picture' : 'Change banner image'

export const getTitle = (kind: ProfileImageKind) =>
  kind === 'avatar' ? 'profile picture' : 'banner image'
