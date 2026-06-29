import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import type { ProfileRecordsResult } from '@/features/profile/service/profileRecords'

export type NameRowProfilePreview = {
  readonly themeColor?: string
  readonly avatarUrl?: string
}

const getTextRecordValue = (
  records: ProfileRecordsResult | null | undefined,
  key: string,
): string | undefined => {
  const value = records?.texts.find((text) => text.key === key)?.value.trim()
  return value ? value : undefined
}

export const getNameRowProfilePreview = (params: {
  readonly label: string
  readonly records?: ProfileRecordsResult | null
}): NameRowProfilePreview => {
  const themeColor = getTextRecordValue(params.records, 'theme')
  const avatarRecord = getTextRecordValue(params.records, 'avatar')

  return {
    avatarUrl: avatarRecord ? buildNameAvatarUrl(params.label) : undefined,
    themeColor,
  }
}
