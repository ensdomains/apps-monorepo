export const AVATAR_UPLOAD_BASE_URL =
  'https://avatar-upload-staging.ens-cf.workers.dev'

export const THEME_COLORS = [
  { value: '#0080BC', label: 'Blue' },
  { value: '#ED2496', label: 'Pink' },
  { value: '#007C23', label: 'Green' },
  { value: '#984D1B', label: 'Citrine' },
  { value: '#000000', label: 'Black' },
] as const

export const DEFAULT_THEME_COLOR = THEME_COLORS[0].value
