import {
  AlignLeftIcon,
  CircleUserRoundIcon,
  GlobeIcon,
  ImageIcon,
  LanguagesIcon,
  PaletteIcon,
  UserRoundIcon,
} from 'lucide-react'
import {
  SOCIAL_CONTACT_ICONS,
  type TextRecordIcon,
} from './social-contact-icons'
import { getTextRecordDescriptor, type TextRecordIconId } from './text'

export type { TextRecordIcon } from './social-contact-icons'

const TEXT_RECORD_ICONS: Readonly<Record<TextRecordIconId, TextRecordIcon>> = {
  ...SOCIAL_CONTACT_ICONS,
  'align-left': AlignLeftIcon,
  'circle-user-round': CircleUserRoundIcon,
  globe: GlobeIcon,
  image: ImageIcon,
  languages: LanguagesIcon,
  palette: PaletteIcon,
  'user-round': UserRoundIcon,
}

/** Returns the artwork component for an exact resolver key. */
export function getTextRecordIcon(key: string): TextRecordIcon | undefined {
  const record = getTextRecordDescriptor(key)
  return record && 'icon' in record ? TEXT_RECORD_ICONS[record.icon] : undefined
}
