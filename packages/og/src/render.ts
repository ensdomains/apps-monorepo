import { ImageResponse } from 'workers-og'
import { collapseMarkup } from './markup'

/** The 1.91:1 card every social crawler renders at. */
export const OG_CARD_WIDTH = 1200
export const OG_CARD_HEIGHT = 630

export interface OgFont {
  data: ArrayBuffer
  name: string
  style: 'normal'
  weight: number
}

export interface RenderOgCardOptions {
  fonts: readonly OgFont[]
  height?: number
  width?: number
}

/**
 * Rasterise card markup to a PNG response, or `null` when the render fails.
 *
 * satori and resvg run in a WASM instance that is a per-isolate singleton whose
 * linear memory only ever grows, so a render can throw for reasons unrelated to
 * the card being drawn: an oversized image on a warm isolate exhausts that heap
 * where the same card succeeds on a cold one. Callers get `null` and degrade to
 * something simpler, because an uncaught throw here reaches the runtime as a
 * 1101 and breaks the card on every page at once.
 */
export async function renderOgCard(
  html: string,
  {
    fonts,
    height = OG_CARD_HEIGHT,
    width = OG_CARD_WIDTH,
  }: RenderOgCardOptions,
): Promise<Response | null> {
  let body: ArrayBuffer
  try {
    body = await new ImageResponse(collapseMarkup(html), {
      fonts: [...fonts],
      height,
      width,
    }).arrayBuffer()
  } catch {
    return null
  }

  // workers-og can also fail by producing no bytes rather than by throwing.
  if (body.byteLength === 0) return null

  return new Response(body, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Content-Type': 'image/png',
    },
  })
}
