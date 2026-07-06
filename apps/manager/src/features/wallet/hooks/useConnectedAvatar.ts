import { useQuery } from '@tanstack/react-query'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'

const getProfileTextRecordValue = (
  records:
    | {
        texts: Array<{ key: string; value: string }>
      }
    | null
    | undefined,
  key: string,
): string | undefined => {
  const value = records?.texts.find((text) => text.key === key)?.value.trim()
  return value ? value : undefined
}

export const useConnectedAvatar = ({
  isLoading,
  name,
}: {
  readonly isLoading: boolean
  readonly name?: string
}) => {
  const profileRecords = useQuery({
    ...profileRecordsQuery(name ?? ''),
    enabled: !!name,
  })
  const avatarRecord = getProfileTextRecordValue(profileRecords.data, 'avatar')
  const isProfileLoading = !!name && profileRecords.isLoading

  return {
    url: name && avatarRecord ? buildNameAvatarUrl(name) : undefined,
    themeColor: getProfileTextRecordValue(profileRecords.data, 'theme'),
    isLoading: isLoading || isProfileLoading,
    error: profileRecords.error,
  }
}
