import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'

export const isUploadedProfileImageUrl = (imageUrl: string): boolean =>
  imageUrl.trim().startsWith(`${AVATAR_UPLOAD_BASE_URL}/`)

export const profileImageVersionQuery = (record: string) =>
  queryOptions<number>({
    queryKey: qk('profile', 'image_upload_version', { record: record.trim() }),
    queryFn: skipToken,
    // Successful uploads overwrite a stable URL. Keep its version for this
    // QueryClient's lifetime, including navigation away from the profile.
    gcTime: Number.POSITIVE_INFINITY,
    staleTime: Number.POSITIVE_INFINITY,
  })

export const getVersionedProfileImageUrl = (
  imageUrl: string,
  version: number | undefined,
): string => {
  if (version === undefined || !isUploadedProfileImageUrl(imageUrl)) {
    return imageUrl
  }

  const url = new URL(imageUrl.trim())
  url.searchParams.set('v', String(version))
  return url.toString()
}
