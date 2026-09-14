import type { ProfileTheme } from '@/features/profile/constants'
import { getProfileTheme } from '@/features/profile/utils/themeColor'

export type OgPalette = {
  /** Top stop of the card's background gradient. */
  readonly backgroundFrom: string
  /** Bottom stop of the card's background gradient. */
  readonly backgroundTo: string
  /** Fill behind the name chip. */
  readonly chipBackground: string
  /** Name text inside the chip. */
  readonly chipText: string
  /** Mark, wordmark and address text. */
  readonly text: string
}

/**
 * Literal-hex mirror of `PROFILE_THEMES[].preview`.
 *
 * The theme previews express the same four roles the OG card needs, but as
 * Tailwind classes and `var(--color-ens-*)` gradients — satori resolves
 * neither, so the values are repeated here as hex. Keep in sync with
 * `theme.css`.
 *
 * `chipBackground` is omitted because it is always the theme's own value (the
 * previews' `badgeClassName` resolves to exactly that colour for every theme).
 */
const OG_PALETTES = {
  Citrine: {
    backgroundFrom: '#f8f7e2',
    backgroundTo: '#e1b77e',
    chipText: '#fcfcf3',
    text: '#441b03',
  },
  Garnet: {
    backgroundFrom: '#feeaf0',
    backgroundTo: '#ffc6e0',
    chipText: '#fdf1f5',
    text: '#5a0024',
  },
  Lapis: {
    backgroundFrom: '#e5f7ff',
    backgroundTo: '#a3e0fd',
    chipText: '#f6fbfd',
    text: '#02293b',
  },
  Peridot: {
    backgroundFrom: '#e4ffe3',
    backgroundTo: '#a3fda6',
    chipText: '#e9f7ef',
    text: '#033010',
  },
  // The preview renders a Quartz profile's address in quartz-500; the card uses
  // quartz-900 so the wordmark keeps the contrast the generic card was drawn
  // with (both sit on the same grey gradient).
  Quartz: {
    backgroundFrom: '#f4f4f4',
    backgroundTo: '#e1e1e0',
    chipText: '#f6fbfd',
    text: '#191919',
  },
} as const satisfies Record<
  ProfileTheme['label'],
  Omit<OgPalette, 'chipBackground'>
>

/** Palette for a name card, from its `theme` text record. */
export const getOgPalette = (themeColor?: string | null): OgPalette => {
  const theme = getProfileTheme(themeColor)

  return { ...OG_PALETTES[theme.label], chipBackground: theme.value }
}

/** Palette for the un-themed app card, which carries no name to theme from. */
export const GENERIC_OG_PALETTE: OgPalette = {
  ...OG_PALETTES.Quartz,
  chipBackground: '#02293b',
}
