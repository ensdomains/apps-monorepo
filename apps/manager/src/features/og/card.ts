import { escapeHtml } from '@ens-apps/og/markup'
import {
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
  renderOgCard,
} from '@ens-apps/og/render'
import ensMarkSvg from '@/assets/og/ens-mark.svg?raw'
import { fitOgChipName } from './chipName'
import { loadOgFonts } from './fonts'
import { GENERIC_OG_PALETTE, getOgPalette, type OgPalette } from './palette'

/** Mark and wordmark sizes for the two header scales in the design. */
const HEADER_SIZES = {
  large: { gap: 35.84, markHeight: 114.325, markWidth: 103.219, text: 96 },
  small: { gap: 22.4, markHeight: 71.453, markWidth: 64.512, text: 60 },
} as const

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
    <div style="display: flex; flex-direction: column; width: ${OG_CARD_WIDTH}px; height: ${OG_CARD_HEIGHT}px; padding: 80px 120px; box-sizing: border-box; background-color: ${palette.backgroundFrom}; background-image: linear-gradient(185deg, ${palette.backgroundFrom} 7%, ${palette.backgroundTo} 146%);">
      ${body}
    </div>`
}

/** Rasterise card markup with this app's fonts. */
async function renderCardImage(
  html: string,
  requestUrl: string,
): Promise<Response | null> {
  return renderOgCard(html, { fonts: await loadOgFonts(requestUrl) })
}

/** The un-themed app card, used for every route that isn't a name. */
export function renderGenericOgImage(
  requestUrl: string,
): Promise<Response | null> {
  const body = `
    <div style="display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
      ${renderHeader(GENERIC_OG_PALETTE, 'large')}
    </div>`

  return renderCardImage(renderCard(GENERIC_OG_PALETTE, body), requestUrl)
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

  return renderCardImage(renderCard(palette, body), requestUrl)
}
