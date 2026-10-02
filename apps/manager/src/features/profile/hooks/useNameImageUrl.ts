import { useQuery } from '@tanstack/react-query'
import { imageRecordQuery } from '@/features/profile/service/profileImageRecord'
import type { ImageType } from '@/features/profile/service/profileImageUpload'
import { savedProfileImagesQuery } from '@/features/profile/service/profileSavedImages'

export const useNameImageUrl = ({
  name,
  kind,
  fallbackUrl,
}: {
  readonly name?: string
  readonly kind: ImageType
  readonly fallbackUrl?: string
}): string | undefined => {
  const savedImages = useQuery(savedProfileImagesQuery(name ?? ''))
  const record = name ? savedImages.data?.[kind]?.record : undefined
  const image = useQuery(imageRecordQuery(record?.trim() || undefined))

  // An empty saved record means removal, so never restore its metadata image.
  return record === undefined ? fallbackUrl : (image.data ?? undefined)
}
