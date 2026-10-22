import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'
import {
  AVATAR_UPLOAD_BASE_URL,
  LEGACY_AVATAR_UPLOAD_BASE_URL,
} from '@/features/profile/constants'

export const isUploadedProfileImageUrl = (imageUrl: string): boolean => {
  try {
    const url = new URL(imageUrl.trim())
    return [AVATAR_UPLOAD_BASE_URL, LEGACY_AVATAR_UPLOAD_BASE_URL].some(
      (base) => {
        const root = new URL(base)
        return (
          url.origin === root.origin &&
          url.pathname.startsWith(root.pathname) &&
          /^\/(?:sepolia\/)?[^/]+(?:\/h)?$/.test(url.pathname)
        )
      },
    )
  } catch {
    return false
  }
}

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
