import type { ProfileTheme } from '@/features/profile/constants'
import { getProfileTheme } from '@/features/profile/utils/themeColor'

export type OgPalette = {
  /** Top stop of the card's background gradient. */
  readonly backgroundFrom: string
  /** Bottom stop of the card's background gradient. */
  readonly backgroundTo: string
  /** Fill behind the chip. */
  readonly chipBackground: string
  /** Text inside the chip. */
  readonly chipText: string
  /** The ENS logo under the chip. */
  readonly text: string
}

/**
 * Literal-hex mirror of `PROFILE_THEMES[].preview`.
 *
 * The theme previews express the same roles the OG card needs, but as
 * Tailwind classes and `var(--color-ens-*)` gradients — satori resolves
 * neither, so the values are repeated here as hex. Keep in sync with
 * `theme.css`.
 *
 * `chipBackground` is omitted because it is always the theme's own value (the
 * previews' `badgeClassName` resolves to exactly that colour for every theme),
 * and `chipText` because the design sets every theme's name in quartz-0.
 */
const OG_PALETTES = {
  Citrine: {
    backgroundFrom: '#f8f7e2',
    backgroundTo: '#e1b77e',
    text: '#441b03',
  },
  Garnet: {
    backgroundFrom: '#feeaf0',
    backgroundTo: '#ffc6e0',
    text: '#5a0024',
  },
  Lapis: {
    backgroundFrom: '#e5f7ff',
    backgroundTo: '#a3e0fd',
    text: '#02293b',
  },
  Peridot: {
    backgroundFrom: '#e4ffe3',
    backgroundTo: '#a3fda6',
    text: '#033010',
  },
  // The preview renders a Quartz profile's address in quartz-500; the card uses
  // quartz-900 so the logo keeps its contrast on the grey gradient.
  Quartz: {
    backgroundFrom: '#f4f4f4',
    backgroundTo: '#e1e1e0',
    text: '#191919',
  },
} as const satisfies Record<
  ProfileTheme['label'],
  Omit<OgPalette, 'chipBackground' | 'chipText'>
>

/** quartz-0: the name on every themed chip. */
const NAME_CHIP_TEXT = '#ffffff'

/** Palette for a name card, from its `theme` text record. */
export const getOgPalette = (themeColor?: string | null): OgPalette => {
  const theme = getProfileTheme(themeColor)

  return {
    ...OG_PALETTES[theme.label],
    chipBackground: theme.value,
    chipText: NAME_CHIP_TEXT,
  }
}

/**
 * Palette for the cards with no name to theme from — the app card, an address
 * and an invalid name. A white chip with quartz-500 text, and the logo in the
 * near-black the design draws it with on grey.
 */
export const NEUTRAL_OG_PALETTE: OgPalette = {
  backgroundFrom: OG_PALETTES.Quartz.backgroundFrom,
  backgroundTo: OG_PALETTES.Quartz.backgroundTo,
  chipBackground: '#ffffff',
  chipText: '#595755',
  text: '#1e2122',
}
