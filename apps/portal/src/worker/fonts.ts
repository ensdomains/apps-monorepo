import { createOgFontCache } from '@ens-apps/og/fonts'
import type { OgFont } from '@ens-apps/og/render'

import ogSansFontUrl from '../assets/fonts/og/abc-monument-grotesk-medium.ttf?url'
import ogMonoFontUrl from '../assets/fonts/og/abc-monument-grotesk-mono-regular.ttf?url'
import ogSemiMonoMediumFontUrl from '../assets/fonts/og/abc-monument-grotesk-semi-mono-medium.ttf?url'
import ogSemiMonoFontUrl from '../assets/fonts/og/abc-monument-grotesk-semi-mono-regular.ttf?url'

const fontCache = createOgFontCache()

/**
 * Where a built font lands isn't fixed — the client build moves assets under
 * `/client` — so an `/assets/…` URL is tried both ways. The asset server
 * answers a miss with the SPA shell and a 200, so the loader's sfnt check is
 * what actually decides which candidate won.
 */
function candidateUrls(fontPath: string, requestUrl: string): string[] {
  const paths = fontPath.startsWith('/assets/')
    ? [fontPath, `/client${fontPath}`]
    : [fontPath]

  return paths.map((path) => new URL(path, requestUrl).toString())
}

/**
 * Load the card fonts, dropping any that failed.
 *
 * Semi-Mono ships in both cuts because the design uses the weight to separate
 * an entity's own name from a label describing it: a name chip is Medium, a
 * "permissioned registry" / "invalid name" chip is Regular. satori picks
 * between them on the `font-weight` the markup asks for.
 *
 * A missing face degrades to satori's fallback rather than failing the render,
 * which keeps a card renderable even if an asset lookup misses.
 */
export async function loadOgFonts(
  env: Env,
  requestUrl: string,
): Promise<OgFont[]> {
  const fetchFont = (url: string) => env.ASSETS.fetch(new Request(url))
  const load = (fontPath: string) =>
    fontCache(candidateUrls(fontPath, requestUrl), fetchFont)

  const [sans, mono, semiMono, semiMonoMedium] = await Promise.all([
    load(ogSansFontUrl),
    load(ogMonoFontUrl),
    load(ogSemiMonoFontUrl),
    load(ogSemiMonoMediumFontUrl),
  ])

  return [
    sans ? { data: sans, name: 'OgSans', style: 'normal', weight: 500 } : null,
    mono ? { data: mono, name: 'OgMono', style: 'normal', weight: 400 } : null,
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
  ].filter((font): font is OgFont => font !== null)
}
