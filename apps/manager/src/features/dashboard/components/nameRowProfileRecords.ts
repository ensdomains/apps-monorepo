import type { ProfileRecordsResult } from '@/features/profile/service/profileRecords'

export type NameRowProfilePreview = {
  readonly themeColor?: string
  readonly avatarRecord?: string
  readonly isAvatarPending: boolean
}

const getTextRecordValue = (
  records: Pick<ProfileRecordsResult, 'texts'> | null | undefined,
  key: string,
): string | undefined => {
  const value = records?.texts.find((text) => text.key === key)?.value.trim()
  return value ? value : undefined
}

export const getNameRowProfilePreview = (params: {
  readonly label: string
  readonly name?: string
  readonly records?: Pick<ProfileRecordsResult, 'texts'> | null
  readonly isLoading?: boolean
}): NameRowProfilePreview => {
  const themeColor = getTextRecordValue(params.records, 'theme')
  const avatarRecord = getTextRecordValue(params.records, 'avatar')

  return {
    avatarRecord,
    themeColor,
    isAvatarPending: params.isLoading === true && !params.records,
  }
}
