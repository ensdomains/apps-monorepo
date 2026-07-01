import { useProfileImageVersion } from '@/features/profile/hooks/useProfileImageVersion'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'

export const useConnectedAvatar = () => {
  const reverseNameQuery = useConnectedReverseName()
  const name = reverseNameQuery.data ?? undefined
  const avatarVersion = useProfileImageVersion({ kind: 'avatar', name })

  return {
    url: name ? buildNameAvatarUrl(name, avatarVersion) : undefined,
    isLoading: reverseNameQuery.isLoading,
    error: reverseNameQuery.error,
  }
}
