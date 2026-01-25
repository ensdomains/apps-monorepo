import { useQuery } from '@tanstack/react-query'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { useSmartAccountContext } from '@/lib/smart-account'

export const useConnectedReverseName = () => {
  const { ownerAddress } = useSmartAccountContext()

  const reverseName = useQuery({
    ...profileReverseNameQuery(ownerAddress ?? undefined),
    enabled: !!ownerAddress,
  })

  return reverseName
}
