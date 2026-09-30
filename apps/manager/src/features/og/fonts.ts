import { createOgFontCache } from '@ens-apps/og/fonts'
import type { OgFont } from '@ens-apps/og/render'

/**
 * Font loading for the OG cards.
 *
 * satori can't read the app's own WOFF2 faces, so `public/og/fonts` carries TTF
 * builds of the same three. They live in `public/` rather than the bundle
 * because the worker fetches them over its own origin — inlining ~600KB of
 * base64 would count against the worker's upload size, static assets don't.
 */

const FONT_PATHS = {
  mono: '/og/fonts/GeistMono-Regular.ttf',
  sans: '/og/fonts/Geist-Medium.ttf',
  semiMono: '/og/fonts/GeistMono-Regular.ttf',
} as const

const fontCache = createOgFontCache()

// The worker has no `ASSETS` binding, so fonts come back over its own origin.
const fetchFont = (url: string) => fetch(url)

/**
 * Load the card fonts, dropping any that failed.
 *
 * A missing face degrades to satori's fallback rather than failing the render,
 * which keeps a card renderable even if an asset fetch goes wrong.
 */
export async function loadOgFonts(requestUrl: string): Promise<OgFont[]> {
  // Cached on the absolute URL, so an isolate serving more than one origin
  // (a preview deployment beside production) can't cross its fonts over.
  const load = (path: string) =>
    fontCache([new URL(path, requestUrl).toString()], fetchFont)

  const [sans, semiMono, mono] = await Promise.all([
    load(FONT_PATHS.sans),
    load(FONT_PATHS.semiMono),
    load(FONT_PATHS.mono),
  ])

  return [
    sans ? { data: sans, name: 'OgSans', style: 'normal', weight: 500 } : null,
    semiMono
      ? { data: semiMono, name: 'OgSemiMono', style: 'normal', weight: 400 }
      : null,
    mono ? { data: mono, name: 'OgMono', style: 'normal', weight: 400 } : null,
  ].filter((font): font is OgFont => font !== null)
}
