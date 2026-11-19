import SiDiscord from '@icons-pack/react-simple-icons/icons/SiDiscord'
import SiFarcaster from '@icons-pack/react-simple-icons/icons/SiFarcaster'
import SiGithub from '@icons-pack/react-simple-icons/icons/SiGithub'
import SiInstagram from '@icons-pack/react-simple-icons/icons/SiInstagram'
import SiMastodon from '@icons-pack/react-simple-icons/icons/SiMastodon'
import SiReddit from '@icons-pack/react-simple-icons/icons/SiReddit'
import SiTelegram from '@icons-pack/react-simple-icons/icons/SiTelegram'
import SiTiktok from '@icons-pack/react-simple-icons/icons/SiTiktok'
import SiTwitch from '@icons-pack/react-simple-icons/icons/SiTwitch'
import SiX from '@icons-pack/react-simple-icons/icons/SiX'
import SiYoutube from '@icons-pack/react-simple-icons/icons/SiYoutube'
import {
  ClockIcon,
  HouseIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
} from 'lucide-react'
import type { FC } from 'react'
import type { TextRecordDescriptor } from './text'
import { LinkedInIcon } from './text-linkedin-icon'

type SocialContactIconId = Extract<
  TextRecordDescriptor,
  { readonly role: 'social' | 'contact' }
>['icon']

export type TextRecordIcon = FC<{ readonly className?: string }>

export const SOCIAL_CONTACT_ICONS = {
  clock: ClockIcon,
  discord: SiDiscord,
  farcaster: SiFarcaster,
  github: SiGithub,
  house: HouseIcon,
  instagram: SiInstagram,
  linkedin: LinkedInIcon,
  mail: MailIcon,
  'map-pin': MapPinIcon,
  mastodon: SiMastodon,
  phone: PhoneIcon,
  reddit: SiReddit,
  telegram: SiTelegram,
  tiktok: SiTiktok,
  twitch: SiTwitch,
  x: SiX,
  youtube: SiYoutube,
} as const satisfies Readonly<Record<SocialContactIconId, TextRecordIcon>>
