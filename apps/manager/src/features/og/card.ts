import { fitOgChipName, type OgChipMetrics } from '@ens-apps/og/chipName'
import { escapeHtml } from '@ens-apps/og/markup'
import {
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
  renderOgCard,
} from '@ens-apps/og/render'
import ensLogoSvg from '@/assets/og/ens-logo.svg?raw'
import errorIconSvg from '@/assets/og/error-icon.svg?raw'
import { loadOgFonts } from './fonts'
import { getOgPalette, NEUTRAL_OG_PALETTE, type OgPalette } from './palette'

/**
 * Logo sizes for the three scales in the design: under a name chip, under an
 * address, and on its own (the app card, and an invalid name).
 */
const LOGO_SIZES = {
  address: { height: 106.092, width: 240 },
  large: { height: 127.31, width: 288 },
  name: { height: 95.4825, width: 216 },
} as const

/** Gap between the chip and the logo beneath it. */
const STACK_GAP = 40

/** The name chip's avatar, and the gap that follows it. */
const AVATAR_SIZE = 140
const AVATAR_GAP = 30

/** The name chip's padding, which grows when there's no avatar to fill it. */
const NAME_CHIP_PADDING = { avatar: 24, bare: 34 } as const

/** Content width: the card less its 120px side padding. */
const CONTENT_WIDTH = OG_CARD_WIDTH - 120 * 2

/**
 * Where a name wraps and ellipsises: 80px Geist Mono (0.6em a glyph) plus the
 * chip's 0.576px letter-spacing, up to the four lines the design tops out at.
 */
const NAME_CHIP_METRICS: OgChipMetrics = {
  charWidth: 48 + 0.576,
  maxLines: 4,
  textWidth: CONTENT_WIDTH - NAME_CHIP_PADDING.bare * 2,
  textWidthWithAvatar:
    CONTENT_WIDTH - NAME_CHIP_PADDING.avatar * 2 - AVATAR_SIZE - AVATAR_GAP,
}

/** The neutral chip's icon box — Material Symbols glyphs are square. */
const CHIP_ICON_SIZE = 56

/** Width an address wraps at — two lines, as the design draws. */
const ADDRESS_WIDTH = 835

/** An SVG as an inline `data:` URI, with its placeholder colour substituted. */
function svgDataUri(svg: string, placeholder: string, color: string): string {
  return `data:image/svg+xml;base64,${btoa(svg.replace(placeholder, color))}`
}

/** The ENS logo, recoloured for the card's palette. */
function renderLogo(
  palette: OgPalette,
  scale: keyof typeof LOGO_SIZES,
): string {
  const { height, width } = LOGO_SIZES[scale]
  const logo = svgDataUri(ensLogoSvg, '__LOGO_COLOR__', palette.text)

  return `<img src="${logo}" width="${width}" height="${height}" style="width: ${width}px; height: ${height}px;" />`
}

/** The name chip: avatar (when the name has one) beside the name itself. */
function renderNameChip(
  name: string,
  avatar: string | null,
  palette: OgPalette,
): string {
  const { isWide, text } = fitOgChipName(
    name,
    avatar !== null,
    NAME_CHIP_METRICS,
  )
  const avatarHtml = avatar
    ? `<img src="${escapeHtml(avatar)}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" style="width: ${AVATAR_SIZE}px; height: ${AVATAR_SIZE}px; object-fit: cover;" />`
    : ''
  const padding = avatar ? NAME_CHIP_PADDING.avatar : NAME_CHIP_PADDING.bare

  // A name that fits on one line hugs its chip; anything longer spans the card
  // and wraps, so the chip aligns to the top of the text rather than centring
  // against it.
  const layout = isWide
    ? 'width: 100%; align-items: flex-start;'
    : 'align-items: center;'
  const textLayout = isWide
    ? 'flex-grow: 1; word-break: break-all;'
    : 'white-space: nowrap;'

  return `
    <div style="display: flex; box-sizing: border-box; gap: ${AVATAR_GAP}px; min-height: 115.2px; padding: ${padding}px; border-radius: 12px; background: ${palette.chipBackground}; ${layout}">
      ${avatarHtml}
      <div style="display: flex; font-family: 'OgSemiMono'; font-weight: 500; font-size: 80px; line-height: 86.4px; letter-spacing: 0.576px; color: ${palette.chipText}; ${textLayout}">${escapeHtml(text)}</div>
    </div>`
}

/** The white chip the neutral cards carry their subject in. */
function renderNeutralChip(contents: string): string {
  return `
    <div style="display: flex; box-sizing: border-box; align-items: center; gap: 16px; min-height: 76.8px; padding: 12px; border-radius: 16px; background: ${NEUTRAL_OG_PALETTE.chipBackground};">
      ${contents}
    </div>`
}

/** The card frame every variant is drawn inside. */
function renderCard(palette: OgPalette, body: string): string {
  return `
    <div style="display: flex; flex-direction: column; width: ${OG_CARD_WIDTH}px; height: ${OG_CARD_HEIGHT}px; padding: 80px 120px; box-sizing: border-box; background-color: ${palette.backgroundFrom}; background-image: linear-gradient(185deg, ${palette.backgroundFrom} 7%, ${palette.backgroundTo} 146%);">
      <div style="display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: ${STACK_GAP}px; width: 100%;">
        ${body}
      </div>
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
  return renderCardImage(
    renderCard(NEUTRAL_OG_PALETTE, renderLogo(NEUTRAL_OG_PALETTE, 'large')),
    requestUrl,
  )
}

export type NameOgCard = {
  /** Avatar as a `data:` URI, when the name has one. */
  readonly avatar: string | null
  readonly name: string
  /** The name's `theme` text record. */
  readonly themeColor: string | null
}

/**
 * Render a name's card: the themed chip, centred, with the logo beneath.
 *
 * The card names the name and nothing else — the address it resolves to is
 * deliberately left off, so a shared name isn't shown beside a hex string.
 */
export function renderNameOgImage(
  card: NameOgCard,
  requestUrl: string,
): Promise<Response | null> {
  const palette = getOgPalette(card.themeColor)

  return renderCardImage(
    renderCard(
      palette,
      renderNameChip(card.name, card.avatar, palette) +
        renderLogo(palette, 'name'),
    ),
    requestUrl,
  )
}

/**
 * Render an address's card: the address in a white chip, logo beneath.
 *
 * The address is split into two equal lines by hand. Geist Mono runs narrower
 * than the face the design was drawn in, so letting it wrap at the design's
 * width would break it 22/20 rather than the even 21/21 the design shows.
 */
export function renderAddressOgImage(
  address: string,
  requestUrl: string,
): Promise<Response | null> {
  const palette = NEUTRAL_OG_PALETTE
  const half = Math.ceil(address.length / 2)
  const lines = [address.slice(0, half), address.slice(half)]
    .map((line) => `<div style="display: flex;">${escapeHtml(line)}</div>`)
    .join('')
  const chip = renderNeutralChip(
    `<div style="display: flex; flex-direction: column; align-items: center; width: ${ADDRESS_WIDTH}px; font-family: 'OgMono'; font-size: 60px; line-height: 1.2; letter-spacing: 1.2px; color: ${palette.chipText};">${lines}</div>`,
  )

  return renderCardImage(
    renderCard(palette, chip + renderLogo(palette, 'address')),
    requestUrl,
  )
}

/** Render the card for a name that doesn't normalise. */
export function renderInvalidNameOgImage(
  requestUrl: string,
): Promise<Response | null> {
  const palette = NEUTRAL_OG_PALETTE
  const icon = svgDataUri(errorIconSvg, '__ICON_COLOR__', palette.chipText)
  const chip = renderNeutralChip(
    `<img src="${icon}" width="${CHIP_ICON_SIZE}" height="${CHIP_ICON_SIZE}" style="width: ${CHIP_ICON_SIZE}px; height: ${CHIP_ICON_SIZE}px;" />
     <div style="display: flex; font-family: 'OgSemiMono'; font-weight: 400; font-size: 60px; line-height: 57.6px; letter-spacing: 0.384px; color: ${palette.chipText}; white-space: nowrap;">invalid name</div>`,
  )

  return renderCardImage(
    renderCard(palette, chip + renderLogo(palette, 'large')),
    requestUrl,
  )
}
