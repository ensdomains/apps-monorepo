import citrineCover from '@/assets/profile/default-covers/citrine.png'
import garnetCover from '@/assets/profile/default-covers/garnet.png'
import graceCover from '@/assets/profile/default-covers/grace.png'
import lapisCover from '@/assets/profile/default-covers/lapis.png'
import peridotCover from '@/assets/profile/default-covers/peridot.png'
import quartzCover from '@/assets/profile/default-covers/quartz.png'
import type { ProfileTheme } from '../constants'
import { getProfileTheme } from './themeColor'

const DEFAULT_HEADER_COVERS = {
  Citrine: citrineCover,
  Garnet: garnetCover,
  Lapis: lapisCover,
  Peridot: peridotCover,
  Quartz: quartzCover,
} satisfies Record<ProfileTheme['label'], string>

type GetDefaultHeaderCoverOptions = {
  readonly isInGrace?: boolean
  readonly themeColor?: string | null
}

export const getDefaultHeaderCover = ({
  isInGrace = false,
  themeColor,
}: GetDefaultHeaderCoverOptions): string =>
  isInGrace
    ? graceCover
    : DEFAULT_HEADER_COVERS[getProfileTheme(themeColor).label]
