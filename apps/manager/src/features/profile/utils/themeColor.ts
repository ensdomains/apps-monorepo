export const getThemeVars = (hex: string): Record<string, string> => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const mix = (channel: number, whiteRatio: number): number =>
    Math.round(channel + (255 - channel) * whiteRatio)

  const toHex = (channel: number): string =>
    channel.toString(16).padStart(2, '0')

  const bg = `#${toHex(mix(r, 0.85))}${toHex(mix(g, 0.85))}${toHex(mix(b, 0.85))}`
  const hoverBg = `#${toHex(mix(r, 0.75))}${toHex(mix(g, 0.75))}${toHex(mix(b, 0.75))}`

  return {
    '--theme-color': hex,
    '--theme-bg': bg,
    '--theme-hover-bg': hoverBg,
  }
}
