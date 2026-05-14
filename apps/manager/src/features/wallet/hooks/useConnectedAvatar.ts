import { useAvatarFromName } from '@/features/profile/service/profileAvatar'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'

export const useConnectedAvatar = () => {
  const reverseNameQuery = useConnectedReverseName()
  const { data, isLoading, error } = useAvatarFromName({
    name: reverseNameQuery.data ?? undefined,
  })

  return {
    url: data,
    isLoading: reverseNameQuery.isLoading || isLoading,
    error,
  }
}
