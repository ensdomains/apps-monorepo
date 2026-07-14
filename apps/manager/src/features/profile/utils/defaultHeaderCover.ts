import defaultHeaderCoverSvg from '@/assets/profile/default-header-cover.svg?raw'
import type { ProfileTheme } from '../constants'
import { getProfileTheme } from './themeColor'

type CoverKey = ProfileTheme['label'] | 'Grace'

type CoverConfig = {
  readonly color: string
  readonly figmaNodeId: string
}

const COVER_CONFIGS = {
  Citrine: {
    color: '#984D1B',
    figmaNodeId: '3894:147470',
  },
  Garnet: {
    color: '#E72A96',
    figmaNodeId: '3514:13081',
  },
  Grace: {
    color: '#87514C',
    figmaNodeId: '4379:10976',
  },
  Lapis: {
    color: '#0082BB',
    figmaNodeId: '3514:13078',
  },
  Peridot: {
    color: '#007C20',
    figmaNodeId: '3514:13077',
  },
  Quartz: {
    color: '#02293B',
    figmaNodeId: '3514:13079',
  },
} satisfies Record<CoverKey, CoverConfig>

const coverCache = new Map<CoverKey, string>()

const buildCover = (key: CoverKey): string => {
  const cachedCover = coverCache.get(key)
  if (cachedCover) return cachedCover

  const config = COVER_CONFIGS[key]
  const svg = defaultHeaderCoverSvg
    .replace('__COVER_COLOR__', config.color)
    .replace('__FIGMA_NODE_ID__', config.figmaNodeId)
  const cover = `data:image/svg+xml,${encodeURIComponent(svg)}`

  coverCache.set(key, cover)
  return cover
}

type GetDefaultHeaderCoverOptions = {
  readonly isInGrace?: boolean
  readonly themeColor?: string | null
}

export const getDefaultHeaderCover = ({
  isInGrace = false,
  themeColor,
}: GetDefaultHeaderCoverOptions): string =>
  buildCover(isInGrace ? 'Grace' : getProfileTheme(themeColor).label)
