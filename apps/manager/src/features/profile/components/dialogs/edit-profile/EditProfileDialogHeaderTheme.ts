import type { CSSProperties } from 'react'
import { getThemeVars } from '@/features/profile/utils/themeColor'

export const getEditProfileDialogHeaderStyle = (
  themeColor?: string | null,
): CSSProperties => getThemeVars(themeColor) as CSSProperties
