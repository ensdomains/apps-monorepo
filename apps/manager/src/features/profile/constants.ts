export const AVATAR_UPLOAD_BASE_URL =
  'https://avatar-upload-staging.ens-cf.workers.dev'

export const THEME_COLORS = [
  { value: '#02293B', label: 'Quartz' },
  { value: '#E72A96', label: 'Garnet' },
  { value: '#0082BB', label: 'Lapis' },
  { value: '#007C20', label: 'Peridot' },
  { value: '#984D1B', label: 'Citrine' },
] as const

export type ThemeColorValue = (typeof THEME_COLORS)[number]['value']

export const DEFAULT_THEME_COLOR: ThemeColorValue = '#0082BB'

export const THEME_COLOR_ALIASES = {
  '#000000': '#02293B',
  '#191919': '#02293B',
  '#ED2496': '#E72A96',
  '#0080BC': '#0082BB',
  '#007C23': '#007C20',
} as const satisfies Record<string, ThemeColorValue>
