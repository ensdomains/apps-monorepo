import { useQuery } from '@tanstack/react-query'
import { imageRecordQuery } from '@/features/profile/service/profileImageRecord'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'

export const useConnectedAvatar = () => {
  const reverseNameQuery = useConnectedReverseName()
  const name = reverseNameQuery.data ?? undefined
  const profileRecords = useQuery({
    ...profileRecordsQuery(name ?? ''),
    enabled: !!name,
  })
  const avatarRecord = profileRecords.data?.texts
    .find((record) => record.key === 'avatar')
    ?.value.trim()
  const avatar = useQuery(imageRecordQuery(avatarRecord))
  const savedTheme = profileRecords.data?.texts.find(
    (record) => record.key === 'theme',
  )?.value
  const themeColor = savedTheme
    ? getThemeVars(savedTheme)['--theme-color']
    : undefined

  return {
    url: avatar.data ?? undefined,
    themeColor,
    isLoading:
      reverseNameQuery.isLoading ||
      profileRecords.isLoading ||
      avatar.isLoading,
    error: reverseNameQuery.error ?? profileRecords.error ?? avatar.error,
  }
}
