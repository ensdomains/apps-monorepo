import { ImageResponse } from 'workers-og'

import ensMarkSvg from '../assets/fonts/og/ens-mark.svg?raw'
import ensLogoSvg from '../assets/fonts/og/Logo.svg?raw'
import walletIconSvg from '../assets/fonts/og/wallet-icon.svg?raw'

import { buildOgFontList, loadOgFonts, type OgFonts } from './fonts'
import { truncate, truncateAddress } from './routing'

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const NAME_SUBPAGE_LABELS: Record<string, string> = {
  ownership: 'Ownership',
  records: 'Records',
  registry: 'Registry',
  resolver: 'Resolver',
  subnames: 'Subnames',
  roles: 'Roles',
}

const ADDR_SUBPAGE_LABELS: Record<string, string> = {
  names: 'Names',
  history: 'History',
  resolution: 'Address Resolution',
  'reverse-resolution': 'Reverse Resolution',
}

function getPageLabel(
  subpage: string | null,
  labels: Record<string, string>,
  defaultLabel: string,
): string {
  return subpage
    ? (labels[subpage] ??
        `${subpage.charAt(0).toUpperCase()}${subpage.slice(1)}`)
    : defaultLabel
}

async function renderOgResponse(
  html: string,
  fonts: OgFonts,
): Promise<Response> {
  const imageResponse = new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: buildOgFontList(fonts),
  })

  const buf = await imageResponse.arrayBuffer()
  if (buf.byteLength === 0) {
    return new Response('OG image rendering produced empty output', {
      status: 500,
    })
  }

  return new Response(buf, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}

function renderOgHeader(): string {
  return `
    <div style="position: absolute; left: 48px; top: 46px; display: flex; align-items: flex-start;">
      <img src="data:image/svg+xml;base64,${btoa(ensLogoSvg)}" width="362" height="51" style="width: 362px; height: 51px;" />
    </div>`
}

export async function renderOgImage(
  name: string,
  avatar: string | null,
  owner: string | null,
  requestUrl: string,
  env: Env,
  subpage: string | null = null,
): Promise<Response> {
  const fonts = await loadOgFonts(env, requestUrl)
  const available = !owner
  const displayName = truncate(name, 28)
  const headerHtml = renderOgHeader()
  const pageLabel = getPageLabel(subpage, NAME_SUBPAGE_LABELS, 'Name Overview')

  let html: string
  if (available) {
    html = `
    <div style="position: relative; width: 100%; height: 100%; background: white; display: flex; align-items: center; justify-content: center; padding: 100px; box-sizing: border-box;">
      <div style="display: flex; align-items: center; gap: 48px; width: 100%;">
        <img src="data:image/svg+xml;base64,${btoa(ensMarkSvg)}" width="126" height="140" style="width: 126px; height: 140px; flex-shrink: 0;" />
        <div style="display: flex; flex-direction: column; gap: 20px; color: #191919; min-width: 0; flex: 1;">
          <h1 style="margin: 0; font-size: 82px; line-height: 0.95; font-weight: 500; font-family: 'OgSemiMono', ui-monospace, monospace; overflow: hidden; max-height: 156px; word-break: break-all;">
            ${escapeHtml(displayName)}
          </h1>
          <p style="margin: 0; font-size: 40px; line-height: 0.75; font-weight: 500; font-family: 'OgMono', ui-monospace, monospace; white-space: nowrap; overflow: hidden;">
            Available to register
          </p>
        </div>
      </div>
      ${headerHtml}
    </div>
  `
  } else {
    const displayAddress = truncateAddress(owner, 6, 5)
    const avatarHtml = avatar
      ? `<img src="${escapeHtml(avatar)}" width="140" height="140" style="width: 140px; height: 140px; border-radius: 8px; object-fit: cover;" />`
      : `<div style="width: 140px; height: 140px; border-radius: 8px; background: #0082BB; display: flex; align-items: center; justify-content: center; color: white; font-size: 48px; font-weight: 500; font-family: 'OgSemiMono', ui-monospace, monospace;">${escapeHtml(name.charAt(0).toUpperCase())}</div>`

    html = `
    <div style="position: relative; width: 100%; height: 100%; background: #ECECEC; display: flex; align-items: center; justify-content: center; padding: 100px; box-sizing: border-box;">
      <div style="display: flex; align-items: center; gap: 48px; width: 100%;">
        <div style="width: 140px; height: 140px; border-radius: 8px; background: #0082BB; overflow: hidden; flex-shrink: 0; display: flex;">${avatarHtml}</div>
        <div style="display: flex; flex-direction: column; gap: 20px; color: #191919; min-width: 0; flex: 1;">
          <h1 style="margin: 0; font-size: 82px; line-height: 0.95; font-weight: 500; font-family: 'OgSemiMono', ui-monospace, monospace; overflow: hidden; max-height: 156px; word-break: break-all;">
            ${escapeHtml(displayName)}
          </h1>
          <p style="margin: 0; font-size: 40px; line-height: 0.75; font-weight: 500; font-family: 'OgMono', ui-monospace, monospace; white-space: nowrap; overflow: hidden;">
            ${escapeHtml(displayAddress)}
          </p>
        </div>
      </div>
      ${headerHtml}
      <div style="position: absolute; right: 48px; bottom: 70px; transform: translateY(50%); font-size: 49px; line-height: 1; color: #000000; font-family: 'OgSans', system-ui, sans-serif; font-weight: 500; text-align: right; display: flex;">
        ${escapeHtml(pageLabel)}
      </div>
    </div>
  `
  }

  return renderOgResponse(html, fonts)
}

export async function renderAddressOgImage(
  address: string,
  requestUrl: string,
  env: Env,
  subpage: string | null = null,
): Promise<Response> {
  const fonts = await loadOgFonts(env, requestUrl)
  const displayAddress = truncateAddress(address, 6, 5)
  const headerHtml = renderOgHeader()
  const pageLabel = getPageLabel(
    subpage,
    ADDR_SUBPAGE_LABELS,
    'Address Overview',
  )

  const html = `
    <div style="position: relative; width: 100%; height: 100%; background: white; display: flex; align-items: center; justify-content: center; padding: 100px; box-sizing: border-box;">
      <div style="display: flex; align-items: center; gap: 48px; width: 100%;">
        <div style="width: 140px; height: 140px; border-radius: 8px; background: #ECECEC; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <img src="data:image/svg+xml;base64,${btoa(walletIconSvg)}" width="93" height="82" style="width: 93px; height: 82px;" />
        </div>
        <div style="display: flex; flex-direction: column; gap: 20px; color: #191919; min-width: 0; flex: 1;">
          <h1 style="margin: 0; font-size: 82px; line-height: 0.95; font-weight: 500; font-family: 'OgMono', ui-monospace, monospace; white-space: nowrap; overflow: hidden;">
            ${escapeHtml(displayAddress)}
          </h1>
        </div>
      </div>
      ${headerHtml}
      <div style="position: absolute; right: 48px; bottom: 70px; transform: translateY(50%); font-size: 49px; line-height: 1; color: #000000; font-family: 'OgSans', system-ui, sans-serif; font-weight: 500; text-align: right; display: flex;">
        ${escapeHtml(pageLabel)}
      </div>
    </div>
  `

  return renderOgResponse(html, fonts)
}

export async function renderDefaultOgImage(
  requestUrl: string,
  env: Env,
): Promise<Response> {
  const fonts = await loadOgFonts(env, requestUrl)

  const html = `
    <div style="position: relative; width: 100%; height: 100%; background: white; display: flex; align-items: center; justify-content: center; padding: 100px; box-sizing: border-box;">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 43px;">
        <img src="data:image/svg+xml;base64,${btoa(ensMarkSvg)}" width="126" height="140" style="width: 126px; height: 140px; border-radius: 8px;" />
        <span style="font-size: 85px; font-weight: 500; font-family: 'OgSans', system-ui, sans-serif; color: black; line-height: 1;">ENS Explorer</span>
      </div>
    </div>
  `

  return renderOgResponse(html, fonts)
}

export async function renderTldOgImage(
  tld: string,
  requestUrl: string,
  env: Env,
): Promise<Response> {
  const fonts = await loadOgFonts(env, requestUrl)
  const displayTld = tld.toUpperCase()
  const headerHtml = renderOgHeader()

  const html = `
    <div style="position: relative; width: 100%; height: 100%; background: #ECECEC; display: flex; align-items: center; justify-content: center; padding: 100px; box-sizing: border-box;">
      <div style="display: flex; align-items: center; gap: 48px; width: 100%;">
        <div style="width: 140px; height: 140px; border-radius: 8px; background: #0082BB; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <span style="font-size: 64px; font-weight: 500; font-family: 'OgSemiMono', ui-monospace, monospace; color: white;">${escapeHtml(displayTld)}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 20px; color: #191919; min-width: 0; flex: 1;">
          <h1 style="margin: 0; font-size: 72px; line-height: 1; font-weight: 500; font-family: 'OgSemiMono', ui-monospace, monospace; overflow: hidden; max-height: 144px; word-break: break-all;">
            ${escapeHtml(displayTld)}
          </h1>
          <p style="margin: 0; font-size: 36px; line-height: 1; font-weight: 500; font-family: 'OgMono', ui-monospace, monospace; white-space: nowrap; overflow: hidden;">
            Top Level Domain
          </p>
        </div>
      </div>
      ${headerHtml}
    </div>
  `

  return renderOgResponse(html, fonts)
}
