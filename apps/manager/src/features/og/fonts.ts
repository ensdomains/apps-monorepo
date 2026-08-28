/**
 * Font loading for the OG renderer.
 *
 * satori only accepts TTF/OTF/WOFF, so the app's own WOFF2 faces are unusable
 * here; `public/og/fonts` carries TTF builds of the same three faces the cards
 * are drawn in. They live in `public/` rather than the bundle because the
 * worker fetches them over its own origin — inlining ~600KB of base64 would
 * count against the worker's upload size, static assets don't.
 */

const FONT_PATHS = {
  mono: '/og/fonts/abc-monument-grotesk-mono-regular.ttf',
  sans: '/og/fonts/abc-monument-grotesk-medium.ttf',
  semiMono: '/og/fonts/abc-monument-grotesk-semi-mono-regular.ttf',
} as const

/**
 * Per-isolate font cache. Keyed by path, holding the in-flight promise so
 * concurrent renders on a cold isolate share one fetch.
 */
const fontCache = new Map<string, Promise<ArrayBuffer | null>>()

/** True for the sfnt signatures satori can parse (TrueType, CFF, collection). */
function isSupportedSfnt(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false
  const signature = new DataView(buffer, 0, 4).getUint32(0, false)

  return (
    signature === 0x00010000 ||
    signature === 0x4f54544f ||
    signature === 0x74746366
  )
}

function loadFont(
  path: string,
  requestUrl: string,
): Promise<ArrayBuffer | null> {
  const cached = fontCache.get(path)
  if (cached) return cached

  const promise = (async () => {
    try {
      const response = await fetch(new URL(path, requestUrl))
      if (!response.ok) return null

      const buffer = await response.arrayBuffer()

      return isSupportedSfnt(buffer) ? buffer : null
    } catch {
      return null
    }
  })()

  fontCache.set(path, promise)
  return promise
}

export type OgFont = {
  readonly data: ArrayBuffer
  readonly name: string
  readonly style: 'normal'
  readonly weight: number
}

/**
 * Load the card fonts, dropping any that failed.
 *
 * A missing face degrades to satori's fallback rather than failing the render,
 * which keeps a card renderable even if an asset fetch goes wrong.
 */
export async function loadOgFonts(requestUrl: string): Promise<OgFont[]> {
  const [sans, semiMono, mono] = await Promise.all([
    loadFont(FONT_PATHS.sans, requestUrl),
    loadFont(FONT_PATHS.semiMono, requestUrl),
    loadFont(FONT_PATHS.mono, requestUrl),
  ])

  return [
    sans ? { data: sans, name: 'OgSans', style: 'normal', weight: 500 } : null,
    semiMono
      ? { data: semiMono, name: 'OgSemiMono', style: 'normal', weight: 400 }
      : null,
    mono ? { data: mono, name: 'OgMono', style: 'normal', weight: 400 } : null,
  ].filter((font): font is OgFont => font !== null)
}
