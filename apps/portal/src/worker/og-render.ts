import { fitOgChipName } from '@ens-apps/og/chipName'
import { escapeHtml } from '@ens-apps/og/markup'
import {
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
  renderOgCard,
} from '@ens-apps/og/render'
import type { Address } from 'viem'

import contractIconSvg from '../assets/fonts/og/contract-icon.svg?raw'
import ensMarkSvg from '../assets/fonts/og/ens-mark.svg?raw'
import walletIconSvg from '../assets/fonts/og/wallet-icon.svg?raw'
import { getContractLabel } from '../utils/ens/ensContractNames'
import { loadOgFonts } from './fonts'
import { getOgPalette, type OgPalette } from './og-palette'

/**
 * Mark and wordmark sizes for the two header scales in the design.
 *
 * `row` is the height of the header's own frame, which is taller than the mark
 * — the wordmark's line box sets it. Carrying it explicitly is what puts the
 * mark where Figma draws it (centred, so 5.77px below the row's top at the
 * small scale) rather than flush against the card's padding.
 */
const HEADER_SIZES = {
  large: {
    gap: 35.84,
    markHeight: 114.325,
    markWidth: 103.219,
    row: 133,
    text: 96,
  },
  small: {
    gap: 22.4,
    markHeight: 71.453,
    markWidth: 64.512,
    row: 83,
    text: 60,
  },
} as const

/** Gap between the header, the chip(s) and the subtitle. */
const STACK_GAP = 50

/** Width the subtitle wraps at — two lines for a full 42-character address. */
const SUBTITLE_WIDTH = 808

/** The chip's icon box — Material Symbols glyphs are square. */
const CHIP_ICON_SIZE = 56

/** Width an address wraps at inside a chip — two lines, as the design draws. */
const CHIP_ADDRESS_WIDTH = 835

/** An SVG as an inline `data:` URI, with its placeholder colour substituted. */
function svgDataUri(svg: string, placeholder: string, color: string): string {
  return `data:image/svg+xml;base64,${btoa(svg.replace(placeholder, color))}`
}

/** Mark + "ENS Explorer" wordmark, at either header scale. */
function renderHeader(
  palette: OgPalette,
  scale: keyof typeof HEADER_SIZES,
): string {
  const size = HEADER_SIZES[scale]
  const mark = svgDataUri(ensMarkSvg, '__MARK_COLOR__', palette.text)

  return `
    <div style="display: flex; align-items: center; height: ${size.row}px; gap: ${size.gap}px;">
      <img src="${mark}" width="${size.markWidth}" height="${size.markHeight}" style="width: ${size.markWidth}px; height: ${size.markHeight}px;" />
      <div style="display: flex; font-family: 'OgSans'; font-size: ${size.text}px; font-weight: 500; color: ${palette.text}; white-space: nowrap;">ENS Explorer</div>
    </div>`
}

/**
 * The pill a card's subject sits in.
 *
 * White by default; the address card's second chip is transparent, keeping the
 * chip's padding without the fill, so it takes the card's own tint.
 */
function renderChip(
  background: string,
  contents: string,
  wide = false,
): string {
  const layout = wide
    ? 'width: 100%; align-items: flex-start;'
    : 'align-items: center;'

  return `
    <div style="display: flex; box-sizing: border-box; gap: 16px; min-height: 76.8px; padding: 12px; border-radius: 16px; background: ${background}; ${layout}">
      ${contents}
    </div>`
}

/**
 * A chip that labels its subject rather than naming it — "address",
 * "permissioned resolver". Regular weight, against the Medium a name gets.
 */
function renderLabelChip(
  palette: OgPalette,
  iconSvg: string,
  label: string,
): string {
  const icon = svgDataUri(iconSvg, '__ICON_COLOR__', palette.chipText)

  return renderChip(
    palette.chipBackground,
    `<img src="${icon}" width="${CHIP_ICON_SIZE}" height="${CHIP_ICON_SIZE}" style="width: ${CHIP_ICON_SIZE}px; height: ${CHIP_ICON_SIZE}px;" />
     <div style="display: flex; font-family: 'OgSemiMono'; font-weight: 400; font-size: 60px; line-height: 57.6px; letter-spacing: 0.384px; color: ${palette.chipText}; white-space: nowrap;">${escapeHtml(label)}</div>`,
  )
}

/** The line under the chip: whatever identifies the subject a second way. */
function renderSubtitle(palette: OgPalette, text: string): string {
  return `
    <div style="display: flex; width: ${SUBTITLE_WIDTH}px; font-family: 'OgMono'; font-weight: 400; font-size: 60px; line-height: 1.2; letter-spacing: 1.2px; color: ${palette.chipText}; word-break: break-all;">${escapeHtml(text)}</div>`
}

/** The card frame every variant is drawn inside. */
function renderCard(palette: OgPalette, body: string): string {
  return `
    <div style="display: flex; flex-direction: column; align-items: flex-start; width: ${OG_CARD_WIDTH}px; height: ${OG_CARD_HEIGHT}px; padding: 80px 120px; box-sizing: border-box; background: ${palette.background};">
      ${body}
    </div>`
}

/** The top-aligned body: the header, then whatever the card puts beneath it. */
function renderStack(palette: OgPalette, body: string): string {
  return renderCard(
    palette,
    `<div style="display: flex; flex: 1; flex-direction: column; align-items: flex-start; gap: ${STACK_GAP}px; width: 100%;">
      ${renderHeader(palette, 'small')}
      ${body}
    </div>`,
  )
}

/** Rasterise card markup with this app's fonts. */
async function renderCardImage(
  html: string,
  requestUrl: string,
  env: Env,
): Promise<Response | null> {
  return renderOgCard(html, { fonts: await loadOgFonts(env, requestUrl) })
}

/** The name chip: avatar (when the name has one) beside the name itself. */
function renderNameChip(
  palette: OgPalette,
  name: string,
  avatar: string | null,
): string {
  const { isWide, text } = fitOgChipName(name, avatar !== null)
  const avatarHtml = avatar
    ? `<img src="${escapeHtml(avatar)}" width="80" height="80" style="width: 80px; height: 80px; border-radius: 7.68px; object-fit: cover;" />`
    : ''
  // A name that fits on one line hugs its chip; anything longer spans the card
  // and wraps, so the chip aligns to the top of the text rather than centring
  // against it.
  const textLayout = isWide
    ? 'flex-grow: 1; word-break: break-all;'
    : 'white-space: nowrap;'

  return renderChip(
    palette.chipBackground,
    `${avatarHtml}
     <div style="display: flex; font-family: 'OgSemiMono'; font-weight: 500; font-size: 60px; line-height: 57.6px; letter-spacing: 0.384px; color: ${palette.chipText}; ${textLayout}">${escapeHtml(text)}</div>`,
    isWide,
  )
}

function nameOgHtml(
  name: string,
  avatar: string | null,
  owner: string | null,
): string {
  const palette = getOgPalette('name')

  return renderStack(
    palette,
    renderNameChip(palette, name, avatar) +
      renderSubtitle(palette, owner ?? 'Available to register'),
  )
}

/**
 * Render the name card, falling back to the avatar-less variant if the avatar
 * is what the renderer choked on.
 *
 * The avatar is the only part of this card whose cost is set by someone else —
 * every other element is fixed-size markup we control — so a render that fails
 * with one and succeeds without it is the expected shape of the failure. The
 * fallback is the same chip a name with no avatar record gets.
 */
export async function renderOgImage(
  name: string,
  avatar: string | null,
  owner: string | null,
  requestUrl: string,
  env: Env,
): Promise<Response | null> {
  const rendered = await renderCardImage(
    nameOgHtml(name, avatar, owner),
    requestUrl,
    env,
  )
  if (rendered || !avatar) return rendered

  return renderCardImage(nameOgHtml(name, null, owner), requestUrl, env)
}

/**
 * Render an address card.
 *
 * Two chips rather than a chip and a subtitle: a white one naming the entity
 * kind, then a transparent one — the card's own tint showing through — holding
 * the address at the width it wraps to two lines at.
 */
export function renderAddressOgImage(
  address: string,
  requestUrl: string,
  env: Env,
): Promise<Response | null> {
  const palette = getOgPalette('address')
  const addressChip = renderChip(
    'transparent',
    `<div style="display: flex; width: ${CHIP_ADDRESS_WIDTH}px; font-family: 'OgMono'; font-weight: 400; font-size: 60px; line-height: 1.2; letter-spacing: 1.2px; color: ${palette.chipText}; word-break: break-all;">${escapeHtml(address)}</div>`,
  )

  return renderCardImage(
    renderStack(
      palette,
      renderLabelChip(palette, walletIconSvg, 'address') + addressChip,
    ),
    requestUrl,
    env,
  )
}

/**
 * Chip label for a resolver.
 *
 * A known ENS contract gets the same pill the app labels it with; anything else
 * is a resolver someone deployed, which is a permissioned one when it sits
 * behind our own implementation and a plain resolver otherwise.
 */
export function resolverChipLabel(
  address: string,
  isPermissioned: boolean,
): string {
  return (
    getContractLabel(address as Address) ??
    (isPermissioned ? 'permissioned resolver' : 'resolver')
  )
}

/**
 * Chip label for a registry.
 *
 * The root and legacy registries are known contracts; every other address on
 * the route is a user registry, which is a permissioned registry by definition.
 */
export function registryChipLabel(address: string): string {
  return getContractLabel(address as Address) ?? 'permissioned registry'
}

/** Contract card (resolver / registry): the kind in the chip, address below. */
function renderContractOgImage(
  address: string,
  label: string,
  requestUrl: string,
  env: Env,
): Promise<Response | null> {
  const palette = getOgPalette('contract')

  return renderCardImage(
    renderStack(
      palette,
      renderLabelChip(palette, contractIconSvg, label) +
        renderSubtitle(palette, address),
    ),
    requestUrl,
    env,
  )
}

export function renderResolverOgImage(
  address: string,
  requestUrl: string,
  env: Env,
  isPermissioned = false,
): Promise<Response | null> {
  return renderContractOgImage(
    address,
    resolverChipLabel(address, isPermissioned),
    requestUrl,
    env,
  )
}

export function renderRegistryOgImage(
  address: string,
  requestUrl: string,
  env: Env,
): Promise<Response | null> {
  return renderContractOgImage(
    address,
    registryChipLabel(address),
    requestUrl,
    env,
  )
}

/** The app card, used for every route with no entity of its own. */
export function renderDefaultOgImage(
  requestUrl: string,
  env: Env,
): Promise<Response | null> {
  const palette = getOgPalette('neutral')
  const body = `
    <div style="display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
      ${renderHeader(palette, 'large')}
    </div>`

  return renderCardImage(renderCard(palette, body), requestUrl, env)
}

/**
 * TLD card.
 *
 * The design set doesn't cover TLDs; a TLD is a name, so it takes the name
 * palette and the chip a name would get.
 */
export function renderTldOgImage(
  tld: string,
  requestUrl: string,
  env: Env,
): Promise<Response | null> {
  const palette = getOgPalette('name')

  return renderCardImage(
    renderStack(
      palette,
      renderNameChip(palette, tld, null) +
        renderSubtitle(palette, 'Top Level Domain'),
    ),
    requestUrl,
    env,
  )
}
