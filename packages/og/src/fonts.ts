/**
 * Font loading for the OG renderer.
 *
 * satori only accepts TTF/OTF/WOFF — not WOFF2, and not a font served as
 * something else — so every load is validated before it is handed over. How the
 * bytes are fetched differs per app (an `ASSETS` binding in one, a request to
 * the worker's own origin in the other), which is the part the caller supplies.
 */

/** True for the sfnt signatures satori can parse (TrueType, CFF, collection). */
export function isSupportedSfnt(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false
  const signature = new DataView(buffer, 0, 4).getUint32(0, false)

  return (
    signature === 0x00010000 ||
    signature === 0x4f54544f ||
    signature === 0x74746366
  )
}

export type OgFontFetcher = (
  path: string,
) => Promise<Response | null | undefined>

/**
 * Build a font cache.
 *
 * The returned loader takes the paths to try in order and resolves to the first
 * that both fetches and parses as an sfnt, or `null` when none do. Validating
 * per candidate is what makes the fallback meaningful: a worker serving a SPA
 * answers a missing asset with `index.html` and a 200, so "fetched" alone
 * doesn't mean "is a font".
 *
 * The fetcher is passed per call rather than per cache so it can close over
 * whatever the current request carries — a binding, an origin — while the cache
 * still lives for the isolate. It is ignored on a hit, so the paths need to
 * identify the bytes on their own.
 *
 * Entries hold the in-flight promise, so concurrent renders on a cold isolate
 * share one fetch.
 */
export function createOgFontCache() {
  const cache = new Map<string, Promise<ArrayBuffer | null>>()

  return function loadFont(
    candidatePaths: readonly string[],
    fetchFont: OgFontFetcher,
  ): Promise<ArrayBuffer | null> {
    const key = candidatePaths.join('\n')
    const cached = cache.get(key)
    if (cached) return cached

    const promise = (async () => {
      for (const path of candidatePaths) {
        try {
          const response = await fetchFont(path)
          if (!response?.ok) continue

          const buffer = await response.arrayBuffer()
          if (isSupportedSfnt(buffer)) return buffer
        } catch {
          // Ignore and try the next candidate.
        }
      }

      return null
    })()

    cache.set(key, promise)
    return promise
  }
}
