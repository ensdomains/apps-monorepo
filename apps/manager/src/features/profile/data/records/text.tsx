import { SOCIAL_CONTACT_ICONS } from '@ens-apps/record-catalog/social-contact-icons'
import { createSocialProfileValueNormalizer } from './social'
import {
  PROFILE_DETAIL_RECORDS,
  type ProfileDetailRecord,
} from './textMetadata'
import type { TextRecordDef } from './types'

function toTextRecordDef({
  key,
  name,
  role,
  icon,
  presentation,
}: ProfileDetailRecord): TextRecordDef {
  const record = {
    key,
    name,
    section: role,
    icon: SOCIAL_CONTACT_ICONS[icon],
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

export const textRecords: readonly TextRecordDef[] =
  PROFILE_DETAIL_RECORDS.map(toTextRecordDef)
