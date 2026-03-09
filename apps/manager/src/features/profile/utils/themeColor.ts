const mix = (channel: number, whiteRatio: number): number =>
  Math.round(channel + (255 - channel) * whiteRatio)

const toHex = (channel: number): string => channel.toString(16).padStart(2, '0')

export const getThemeVars = (hex: string): Record<string, string> => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const colorHex = (ratio: number) =>
    `#${toHex(mix(r, ratio))}${toHex(mix(g, ratio))}${toHex(mix(b, ratio))}`

  return {
    '--theme-color': hex,
    '--theme-surface': colorHex(0.45),
    '--theme-bg': colorHex(0.85),
    '--theme-hover-bg': colorHex(0.75),
  }
}
