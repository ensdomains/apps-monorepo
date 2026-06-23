import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'

export const useConnectedAvatar = () => {
  const reverseNameQuery = useConnectedReverseName()
  const name = reverseNameQuery.data ?? undefined

  return {
    url: name ? buildNameAvatarUrl(name) : undefined,
    isLoading: reverseNameQuery.isLoading,
    error: reverseNameQuery.error,
  }
}
