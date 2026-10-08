import { env } from 'cloudflare:workers'
import { createOgFontCache } from '@ens-apps/og/fonts'
import type { OgFont } from '@ens-apps/og/render'

/**
 * Font loading for the OG cards.
 *
 * satori can't read the app's own WOFF2 faces, so `public/og/fonts` carries TTF
 * builds of the same faces. They live in `public/` rather than the bundle
 * because inlining ~750KB of base64 would count against the worker's upload
 * size, static assets don't.
 */

const FONT_PATHS = {
  mono: '/og/fonts/GeistMono-Regular.ttf',
  sans: '/og/fonts/Geist-Medium.ttf',
  semiMono: '/og/fonts/GeistMono-Regular.ttf',
  semiMonoMedium: '/og/fonts/GeistMono-Medium.ttf',
} as const

const fontCache = createOgFontCache()

// Read through the `ASSETS` binding: a subrequest to the worker's own origin
// doesn't come back to it, so fetching the fonts over the network fails and
// every card falls back to a serif.
const fetchFont = (url: string) => env.ASSETS.fetch(new Request(url))

/**
 * Load the card fonts, dropping any that failed.
 *
 * Semi-Mono ships in both cuts, matching the explorer's cards: a name chip is
 * Medium, an "invalid name" chip is Regular. satori picks between them on the
 * `font-weight` the markup asks for.
 *
 * A missing face degrades to satori's fallback rather than failing the render,
 * which keeps a card renderable even if an asset lookup misses.
 */
export async function loadOgFonts(requestUrl: string): Promise<OgFont[]> {
  // Cached on the absolute URL, so an isolate serving more than one origin
  // (a preview deployment beside production) can't cross its fonts over.
  const load = (path: string) =>
    fontCache([new URL(path, requestUrl).toString()], fetchFont)

  const [sans, semiMono, semiMonoMedium, mono] = await Promise.all([
    load(FONT_PATHS.sans),
    load(FONT_PATHS.semiMono),
    load(FONT_PATHS.semiMonoMedium),
    load(FONT_PATHS.mono),
  ])

  return [
    sans ? { data: sans, name: 'OgSans', style: 'normal', weight: 500 } : null,
    semiMono
      ? { data: semiMono, name: 'OgSemiMono', style: 'normal', weight: 400 }
      : null,
    semiMonoMedium
      ? {
          data: semiMonoMedium,
          name: 'OgSemiMono',
          style: 'normal',
          weight: 500,
        }
      : null,
    mono ? { data: mono, name: 'OgMono', style: 'normal', weight: 400 } : null,
  ].filter((font): font is OgFont => font !== null)
}
