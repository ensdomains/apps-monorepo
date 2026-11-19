import {
  getTextRecordDescriptor,
  PROFILE_TEXT_RECORDS,
  type TextRecordDescriptor,
} from '@ens-apps/record-catalog/text'

export const PROFILE_SECTIONS = ['social', 'contact'] as const

export const STATIC_TEXT_RECORD_KEYS = [
  PROFILE_TEXT_RECORDS.name.key,
  PROFILE_TEXT_RECORDS.avatar.key,
  PROFILE_TEXT_RECORDS.header.key,
  PROFILE_TEXT_RECORDS.description.key,
  PROFILE_TEXT_RECORDS.url.key,
  PROFILE_TEXT_RECORDS.theme.key,
  PROFILE_TEXT_RECORDS.language.key,
  PROFILE_TEXT_RECORDS.primaryContact.key,
  PROFILE_TEXT_RECORDS.primaryContacts.key,
] as const

export type ProfileDetailRecord = Extract<
  TextRecordDescriptor,
  { readonly role: 'social' | 'contact' }
>

const isProfileDetailRecord = (
  record: TextRecordDescriptor,
): record is ProfileDetailRecord =>
  record.role === 'social' || record.role === 'contact'

export const PROFILE_DETAIL_RECORDS = Object.values(
  PROFILE_TEXT_RECORDS,
).filter(isProfileDetailRecord)

export const getProfileDetailRecord = (
  key: string,
): ProfileDetailRecord | undefined => {
  const record = getTextRecordDescriptor(key)
  return record && isProfileDetailRecord(record) ? record : undefined
}
