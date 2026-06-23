import { resolveThemeColor } from '@/features/profile/utils/themeColor'

export const getSelectedThemeColor = (theme?: string | null): string => {
  const trimmedTheme = theme?.trim()
  return trimmedTheme ? resolveThemeColor(trimmedTheme) : ''
}
