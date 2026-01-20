import { useQuery } from '@tanstack/react-query'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { useSmartAccountContext } from '@/lib/smart-account'
import { truncateAddress } from '@/lib/utils'

export const useProfileData = () => {
  const { ownerAddress } = useSmartAccountContext()

  const reverseName = useQuery({
    ...profileReverseNameQuery(ownerAddress ?? undefined),
    enabled: !!ownerAddress,
  })

  const avatarRecord = useQuery({
    ...profileRecordsQuery(reverseName.data ?? ''),
    enabled: !!reverseName.data,
    select: (data) => data?.texts.find((text) => text.key === 'avatar')?.value,
  })

  const parsedAvatar = useQuery({
    ...parseAvatarQuery(avatarRecord.data),
    enabled: !!avatarRecord.data,
  })

  const isAvatarLoading = avatarRecord.isLoading || parsedAvatar.isLoading
  const displayName = reverseName.data ?? truncateAddress(ownerAddress)

  return {
    reverseName: reverseName.data,
    avatar: parsedAvatar.data,
    isLoading: isAvatarLoading,
    displayName,
  }
}
