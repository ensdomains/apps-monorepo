import { getThemeVars } from '@/features/profile/utils/themeColor'

/**
 * Homepage accent from a profile `theme` text record.
 *
 * A non-blank record resolves through `getThemeVars`. A missing or blank
 * record stays `undefined`, so callers keep the Lapis class and the static
 * logo instead of the palette's Lapis hex.
 */
export const homepageThemeColor = (
  record: string | null | undefined,
): string | undefined => {
  const trimmed = record?.trim() ?? ''
  if (trimmed === '') return undefined
  return getThemeVars(record)['--theme-color']
}
