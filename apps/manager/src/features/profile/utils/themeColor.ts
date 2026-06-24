import {
  DEFAULT_THEME_COLOR,
  THEME_COLOR_ALIASES,
  THEME_COLORS,
  type ThemeColorValue,
} from '../constants'

const HEX_COLOR_REGEX = /^#[\da-f]{6}$/i
const DEFAULT_BUTTON_TEXT_COLOR = '#191919'
const THEME_COLORS_BY_HEX = new Map<string, ThemeColorValue>(
  THEME_COLORS.map((theme) => [theme.value.toLowerCase(), theme.value]),
)
const THEME_ALIASES_BY_HEX = new Map<string, ThemeColorValue>(
  Object.entries(THEME_COLOR_ALIASES).map(([from, to]) => [
    from.toLowerCase(),
    to,
  ]),
)
const THEME_BUTTON_TEXT_COLORS = {
  '#02293B': '#02293B',
  '#E72A96': '#5A0024',
  '#0082BB': '#02293B',
  '#007C20': '#033010',
  '#984D1B': '#441B03',
} as const satisfies Record<ThemeColorValue, string>

const mix = (channel: number, whiteRatio: number): number =>
  Math.round(channel + (255 - channel) * whiteRatio)

const mixFloor = (channel: number, whiteRatio: number): number =>
  Math.floor(channel + (255 - channel) * whiteRatio)

const toHex = (channel: number): string =>
  channel.toString(16).padStart(2, '0').toUpperCase()

export const resolveThemeColor = (hex?: string | null): string => {
  const trimmedHex = hex?.trim()
  if (!trimmedHex || !HEX_COLOR_REGEX.test(trimmedHex)) {
    return DEFAULT_THEME_COLOR
  }

  const normalizedHex = trimmedHex.toLowerCase()
  return (
    THEME_COLORS_BY_HEX.get(normalizedHex) ??
    THEME_ALIASES_BY_HEX.get(normalizedHex) ??
    trimmedHex
  )
}

export const getThemeVars = (hex?: string | null): Record<string, string> => {
  const safeHex = resolveThemeColor(hex)
  const r = parseInt(safeHex.slice(1, 3), 16)
  const g = parseInt(safeHex.slice(3, 5), 16)
  const b = parseInt(safeHex.slice(5, 7), 16)

  const colorHex = (ratio: number) =>
    `#${toHex(mix(r, ratio))}${toHex(mix(g, ratio))}${toHex(mix(b, ratio))}`
  const buttonColorHex = (ratio: number) =>
    `#${toHex(mixFloor(r, ratio))}${toHex(mixFloor(g, ratio))}${toHex(
      mixFloor(b, ratio),
    )}`
  const buttonTextColor =
    THEME_BUTTON_TEXT_COLORS[
      safeHex as keyof typeof THEME_BUTTON_TEXT_COLORS
    ] ?? DEFAULT_BUTTON_TEXT_COLOR

  return {
    '--theme-color': safeHex,
    '--theme-surface': colorHex(0.45),
    '--theme-bg': colorHex(0.85),
    '--theme-hover-bg': colorHex(0.75),
    '--theme-button-bg': buttonColorHex(0.88),
    '--theme-button-hover-bg': buttonColorHex(0.82),
    '--theme-button-text': buttonTextColor,
  }
}
