import { ImageResponse } from 'workers-og'
import ensMarkSvg from '@/assets/og/ens-mark.svg?raw'
import { fitOgChipName } from './chipName'
import { loadOgFonts } from './fonts'
import { GENERIC_OG_PALETTE, getOgPalette, type OgPalette } from './palette'

const CARD_WIDTH = 1200
const CARD_HEIGHT = 630

/** Mark and wordmark sizes for the two header scales in the design. */
const HEADER_SIZES = {
  large: { gap: 35.84, markHeight: 114.325, markWidth: 103.219, text: 96 },
  small: { gap: 22.4, markHeight: 71.453, markWidth: 64.512, text: 60 },
} as const

const ESCAPE_HTML_RE = /["&'<>]/g
const ESCAPE_HTML_CHARS = new Map([
  ['"', '&quot;'],
  ['&', '&amp;'],
  ["'", '&#39;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
])

/**
 * Escape a value interpolated into the card markup.
 *
 * Every dynamic value on a card — the name, its avatar URI, its `theme` record
 * — is attacker-controlled for any name someone can register, and the markup is
 * parsed as HTML before it reaches satori.
 */
function escapeHtml(value: string): string {
  return value.replace(
    ESCAPE_HTML_RE,
    (char) => ESCAPE_HTML_CHARS.get(char) ?? char,
  )
}

/** The ENS mark as an inline `data:` URI, recoloured for the card's palette. */
function markDataUri(color: string): string {
  return `data:image/svg+xml;base64,${btoa(
    ensMarkSvg.replace('__MARK_COLOR__', color),
  )}`
}

/** Mark + "ENS App" wordmark, at either header scale. */
function renderHeader(
  palette: OgPalette,
  scale: keyof typeof HEADER_SIZES,
): string {
  const size = HEADER_SIZES[scale]

  return `
    <div style="display: flex; align-items: center; gap: ${size.gap}px;">
      <img src="${markDataUri(palette.text)}" width="${size.markWidth}" height="${size.markHeight}" style="width: ${size.markWidth}px; height: ${size.markHeight}px;" />
      <div style="display: flex; font-family: 'OgSans'; font-size: ${size.text}px; font-weight: 500; color: ${palette.text}; white-space: nowrap;">ENS App</div>
    </div>`
}

/** The name chip: avatar (when the name has one) beside the name itself. */
function renderChip(
  name: string,
  avatar: string | null,
  palette: OgPalette,
): string {
  const { isWide, text } = fitOgChipName(name, avatar !== null)
  const avatarHtml = avatar
    ? `<img src="${escapeHtml(avatar)}" width="80" height="80" style="width: 80px; height: 80px; border-radius: 7.68px; object-fit: cover;" />`
    : ''

  // A name that fits on one line hugs its chip; anything longer spans the card
  // and wraps, so the chip aligns to the top of the text rather than centring
  // against it.
  const layout = isWide
    ? 'width: 100%; align-items: flex-start; padding: 16px 12px;'
    : 'align-items: center; padding: 12px;'
  const textLayout = isWide
    ? 'flex-grow: 1; word-break: break-all;'
    : 'white-space: nowrap;'

  return `
    <div style="display: flex; gap: 16px; min-height: 76.8px; border-radius: 4px; background: ${palette.chipBackground}; ${layout}">
      ${avatarHtml}
      <div style="display: flex; font-family: 'OgSemiMono'; font-size: 60px; line-height: 57.6px; letter-spacing: 0.384px; color: ${palette.chipText}; ${textLayout}">${escapeHtml(text)}</div>
    </div>`
}

/** The card frame every variant is drawn inside. */
function renderCard(palette: OgPalette, body: string): string {
  return `
    <div style="display: flex; flex-direction: column; width: ${CARD_WIDTH}px; height: ${CARD_HEIGHT}px; padding: 80px 120px; box-sizing: border-box; background-color: ${palette.backgroundFrom}; background-image: linear-gradient(185deg, ${palette.backgroundFrom} 7%, ${palette.backgroundTo} 146%);">
      ${body}
    </div>`
}

/**
 * Strip the whitespace between the card's tags.
 *
 * satori keeps inter-element whitespace as a real (zero-width) flex child, so
 * indented markup gains a leading child on every row and `gap` opens a gap
 * before the first element that should be there. Collapsing it is what makes
 * the templates below safe to indent.
 */
function collapseMarkup(html: string): string {
  return html.replace(/>\s+</g, '><').trim()
}

/**
 * Rasterise a card, or `null` when the render fails.
 *
 * satori and resvg run in a WASM instance whose linear memory only ever grows,
 * so a render can throw for reasons unrelated to the card being drawn — an
 * oversized avatar on a warm isolate, say. Callers degrade to the generic card
 * rather than letting that surface as a broken image on the page.
 */
async function rasterise(
  html: string,
  requestUrl: string,
): Promise<Response | null> {
  let body: ArrayBuffer
  try {
    body = await new ImageResponse(collapseMarkup(html), {
      fonts: await loadOgFonts(requestUrl),
      height: CARD_HEIGHT,
      width: CARD_WIDTH,
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

/** The un-themed app card, used for every route that isn't a name. */
export function renderGenericOgImage(
  requestUrl: string,
): Promise<Response | null> {
  const body = `
    <div style="display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
      ${renderHeader(GENERIC_OG_PALETTE, 'large')}
    </div>`

  return rasterise(renderCard(GENERIC_OG_PALETTE, body), requestUrl)
}

export type NameOgCard = {
  /** ETH mainnet address the name resolves to, when it sets one. */
  readonly address: string | null
  /** Avatar as a `data:` URI, when the name has one. */
  readonly avatar: string | null
  readonly name: string
  /** The name's `theme` text record. */
  readonly themeColor: string | null
}

/**
 * Render a name's card.
 *
 * A name that resolves to an address gets the top-aligned layout with the
 * address beneath the chip; one that doesn't gets the centred layout, which
 * carries the larger header in place of the missing address.
 */
export function renderNameOgImage(
  card: NameOgCard,
  requestUrl: string,
): Promise<Response | null> {
  const palette = getOgPalette(card.themeColor)
  const chip = renderChip(card.name, card.avatar, palette)

  const body = card.address
    ? `
    <div style="display: flex; flex: 1; flex-direction: column; align-items: flex-start; gap: 40px; width: 100%;">
      ${renderHeader(palette, 'small')}
      ${chip}
      <div style="display: flex; width: 808px; font-family: 'OgMono'; font-size: 60px; line-height: 1.2; letter-spacing: 1.2px; color: ${palette.text}; text-align: center; word-break: break-all;">${escapeHtml(card.address)}</div>
    </div>`
    : `
    <div style="display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 40px; width: 100%;">
      ${renderHeader(palette, 'large')}
      ${chip}
    </div>`

  return rasterise(renderCard(palette, body), requestUrl)
}
