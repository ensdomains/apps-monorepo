export const getThemeColors = (
  hex: string,
): { bg: string; text: string; hoverBg: string } => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const mix = (channel: number, whiteRatio: number): number =>
    Math.round(channel + (255 - channel) * whiteRatio)

  const toHex = (channel: number): string =>
    channel.toString(16).padStart(2, '0')

  const bgR = mix(r, 0.85)
  const bgG = mix(g, 0.85)
  const bgB = mix(b, 0.85)

  const hoverR = mix(r, 0.75)
  const hoverG = mix(g, 0.75)
  const hoverB = mix(b, 0.75)

  return {
    bg: `#${toHex(bgR)}${toHex(bgG)}${toHex(bgB)}`,
    text: hex,
    hoverBg: `#${toHex(hoverR)}${toHex(hoverG)}${toHex(hoverB)}`,
  }
}
