import {
  PROFILE_TEXT_RECORDS,
  type TextRecordDescriptor,
} from '@ens-apps/record-catalog/text'
import { getTextRecordIcon } from '@ens-apps/record-catalog/text-icons'
import { createSocialProfileValueNormalizer } from './social'
import type { SectionData, TextRecordDef } from './types'

export const specialSections = ['contact'] as const

export const sections = {
  social: { label: 'Connect' },
} as const satisfies Record<string, SectionData>

export const staticTextRecords = [
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

const ALWAYS_FETCH_TEXT_RECORDS: ReadonlySet<string> = new Set([
  PROFILE_TEXT_RECORDS.twitter.key,
  PROFILE_TEXT_RECORDS.telegram.key,
  PROFILE_TEXT_RECORDS.farcaster.key,
  PROFILE_TEXT_RECORDS.discord.key,
  PROFILE_TEXT_RECORDS.github.key,
  PROFILE_TEXT_RECORDS.email.key,
  PROFILE_TEXT_RECORDS.phone.key,
])

type ProfileDetailRecord = Extract<
  TextRecordDescriptor,
  { readonly role: 'social' | 'contact' }
>

function toTextRecordDef({
  key,
  name,
  role,
  presentation,
}: ProfileDetailRecord): TextRecordDef {
  const record = {
    key,
    name,
    section: role,
    icon: getTextRecordIcon(key),
    ...(ALWAYS_FETCH_TEXT_RECORDS.has(key) && {
      forceFetch: 'always' as const,
    }),
  }

  if (presentation.kind === 'copy') {
    return { ...record, kind: 'copy' }
  }

  return {
    ...record,
    kind: 'link',
    href: presentation.href,
    ...('displayPrefix' in presentation && {
      displayPrefix: presentation.displayPrefix,
    }),
    ...('normalization' in presentation && {
      normalize: createSocialProfileValueNormalizer(presentation.normalization),
    }),
  }
}

export const textRecords: readonly TextRecordDef[] = Object.values(
  PROFILE_TEXT_RECORDS,
)
  .filter((record) => record.role === 'social' || record.role === 'contact')
  .map(toTextRecordDef)
