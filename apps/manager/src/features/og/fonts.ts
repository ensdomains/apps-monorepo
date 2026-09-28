import { env } from 'cloudflare:workers'
import { createOgFontCache } from '@ens-apps/og/fonts'
import type { OgFont } from '@ens-apps/og/render'
import ogSansFontUrl from '../../assets/fonts/og/abc-monument-grotesk-medium.ttf?url'
import ogMonoFontUrl from '../../assets/fonts/og/abc-monument-grotesk-mono-regular.ttf?url'
import ogSemiMonoFontUrl from '../../assets/fonts/og/abc-monument-grotesk-semi-mono-regular.ttf?url'

const fontCache = createOgFontCache()

/**
 * Vite's emitted URL may be rooted at `/assets/` or `/client/assets/` in the
 * Start production output. Try both; the shared cache validates the font bytes
 * so a missing asset or SPA fallback still degrades safely.
 */
function candidateUrls(fontPath: string, requestUrl: string): string[] {
  const paths = fontPath.startsWith('/assets/')
    ? [fontPath, `/client${fontPath}`]
    : [fontPath]

  return paths.map((path) => new URL(path, requestUrl).toString())
}

const fetchFont = (url: string) => env.ASSETS.fetch(new Request(url))

/**
 * Load the card fonts, dropping any that failed.
 *
 * A missing face degrades to satori's fallback rather than failing the render,
 * which keeps a card renderable even if an asset fetch goes wrong.
 */
export async function loadOgFonts(requestUrl: string): Promise<OgFont[]> {
  const load = (fontPath: string) =>
    fontCache(candidateUrls(fontPath, requestUrl), fetchFont)

  const [sans, semiMono, mono] = await Promise.all([
    load(ogSansFontUrl),
    load(ogSemiMonoFontUrl),
    load(ogMonoFontUrl),
  ])

  return [
    sans ? { data: sans, name: 'OgSans', style: 'normal', weight: 500 } : null,
    semiMono
      ? { data: semiMono, name: 'OgSemiMono', style: 'normal', weight: 400 }
      : null,
    mono ? { data: mono, name: 'OgMono', style: 'normal', weight: 400 } : null,
  ].filter((font): font is OgFont => font !== null)
}
