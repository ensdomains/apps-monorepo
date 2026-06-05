/**
 * Shared text-mask helpers for the name reveal components (WeaveName, NameFill).
 * The name is drawn as an SVG glyph shape used both as a CSS mask (so a fill — woven
 * fabric or a solid colour — only shows inside the letters) and as the base layer.
 * Geometry is measured with a canvas so the SVG aligns with on-screen rendering.
 */

export const FALLBACK_FONT =
  'Satoshi, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export interface TextMetricsBox {
  width: number
  height: number
  baseline: number
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export interface NameSvgOptions {
  name: string
  box: TextMetricsBox
  fontSize: number
  fontFamily: string
  fontWeight: number | string
  fill: string
}

/** Build a CSS `url(...)` of the name as filled glyphs, sized to the measured box. */
export function nameSvgDataUri({
  name,
  box,
  fontSize,
  fontFamily,
  fontWeight,
  fill,
}: NameSvgOptions): string {
  const { width, height, baseline } = box
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<text x="0" y="${baseline}" font-family="${fontFamily.replace(/"/g, "'")}" ` +
    `font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}" ` +
    `xml:space="preserve">${escapeXml(name)}</text></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** Measure the name at the given font using a canvas, so SVG geometry matches rendering. */
export function measureName(
  name: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: number | string,
): TextMetricsBox {
  if (typeof document === 'undefined') {
    return {
      width: name.length * fontSize * 0.55,
      height: fontSize * 1.3,
      baseline: fontSize,
    }
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return {
      width: name.length * fontSize * 0.55,
      height: fontSize * 1.3,
      baseline: fontSize,
    }
  }
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  const m = ctx.measureText(name)
  const ascent = m.actualBoundingBoxAscent || fontSize * 0.8
  const descent = m.actualBoundingBoxDescent || fontSize * 0.25
  const pad = Math.ceil(fontSize * 0.12)
  return {
    width: Math.ceil(m.width) + pad * 2,
    height: Math.ceil(ascent + descent) + pad * 2,
    baseline: Math.ceil(ascent) + pad,
  }
}
