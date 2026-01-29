import { useQuery } from '@tanstack/react-query'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'

export const useConnectedAvatar = () => {
  const reverseNameQuery = useConnectedReverseName()

  const avatarRecord = useQuery({
    ...profileRecordsQuery(reverseNameQuery.data ?? ''),
    enabled: !!reverseNameQuery.data,
    select: (data) => data?.texts.find((text) => text.key === 'avatar')?.value,
  })

  const parsedAvatar = useQuery({
    ...parseAvatarQuery(avatarRecord.data),
    enabled: !!avatarRecord.data,
  })

  return {
    record: avatarRecord.data,
    url: parsedAvatar.data,
    isLoading: avatarRecord.isLoading || parsedAvatar.isLoading,
    error: avatarRecord.error || parsedAvatar.error,
  }
}
