import {
  extendChainWithL1Ens,
  extendChainWithL2Ens,
  getChainContractAddress,
} from '@ensdomains/ensjs/chain'
import { getRecords } from '@ensdomains/ensjs/public'
import { getOwner as getOwnerV1 } from '@ensdomains/ensjs/public/v1'
import { getOwner as getOwnerV2 } from '@ensdomains/ensjs/public/v2'
import { createPublicClient, http, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { parseAvatarRecord } from 'viem/ens'
import { ImageResponse } from 'workers-og'
import ogSansFontUrl from './assets/fonts/og/abc-monument-grotesk-medium.ttf?url'
import ogMonoFontUrl from './assets/fonts/og/abc-monument-grotesk-mono-medium.ttf?url'
import ogSemiMonoFontUrl from './assets/fonts/og/abc-monument-grotesk-semi-mono-medium.ttf?url'
import ensLogoSvg from './assets/fonts/og/ens-logo.svg?raw'
import ensMarkSvg from './assets/fonts/og/ens-mark.svg?raw'
import explorerTextSvg from './assets/fonts/og/explorer-text.svg?raw'
import walletIconSvg from './assets/fonts/og/wallet-icon.svg?raw'
import { truncateAddress } from './utils/formatting/truncateAddress'

const sepoliaWithEns = extendChainWithL1Ens(sepolia)
const namechainSepolia = extendChainWithL2Ens(sepolia)

const v2EthRegistry = getChainContractAddress({
  chain: namechainSepolia,
  contract: 'ensV2EthRegistry',
})

function createL1Client(env: Env) {
  return createPublicClient({
    chain: sepoliaWithEns,
    transport: http(env.SEPOLIA_RPC_URL),
  })
}

function createL2Client(env: Env) {
  return createPublicClient({
    chain: namechainSepolia,
    transport: http(env.SEPOLIA_RPC_URL),
  })
}

type L1Client = ReturnType<typeof createL1Client>
type L2Client = ReturnType<typeof createL2Client>

const fontCache = new Map<string, Promise<ArrayBuffer | null>>()

function isSupportedSfnt(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false
  const sig = new DataView(buffer, 0, 4).getUint32(0, false)

  // TrueType: 0x00010000, OpenType(CFF): "OTTO", TrueType Collection: "ttcf"
  return sig === 0x00010000 || sig === 0x4f54544f || sig === 0x74746366
}

function loadFontData(
  env: Env,
  requestUrl: string,
  fontPath: string,
): Promise<ArrayBuffer | null> {
  const cached = fontCache.get(fontPath)
  if (cached) return cached

  const promise = (async () => {
    const candidatePaths = fontPath.startsWith('/assets/')
      ? [fontPath, `/client${fontPath}`]
      : [fontPath]

    for (const candidatePath of candidatePaths) {
      try {
        const url = new URL(candidatePath, requestUrl).toString()
        const res = await env.ASSETS.fetch(new Request(url))
        if (!res.ok) continue

        const buffer = await res.arrayBuffer()
        if (!isSupportedSfnt(buffer)) continue

        return buffer
      } catch {
        // Ignore and try the next candidate.
      }
    }

    return null
  })()

  fontCache.set(fontPath, promise)
  return promise
}

async function resolveAvatarDataUri(
  client: L1Client,
  avatarRecord: string,
): Promise<string | null> {
  try {
    const url = await parseAvatarRecord(client, {
      record: avatarRecord,
      gatewayUrls: { ipfs: 'https://ipfs.euc.li' },
    })
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? 'image/png'
    const buf = await res.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''),
    )
    return `data:${contentType};base64,${base64}`
  } catch {
    return null
  }
}

async function resolveOwner(
  client: L1Client,
  namechainClient: L2Client,
  name: string,
): Promise<string | null> {
  // Check L1 v1 first
  const v1Owner = await getOwnerV1(client, { name }).catch(() => null)
  if (v1Owner?.owner) return v1Owner.owner

  // Fall back to L2 v2 (Namechain)
  try {
    const labels = name.split('.')
    const v2Owner = await getOwnerV2(namechainClient, {
      label: labels[0],
      registryAddress: v2EthRegistry,
    })
    if (v2Owner && v2Owner !== zeroAddress) return v2Owner
  } catch {
    // v2 lookup failed
  }

  return null
}

interface EnsData {
  avatar: string | null
  description: string | null
  owner: string | null
}

async function fetchEnsData(env: Env, name: string): Promise<EnsData> {
  const client = createL1Client(env)
  const namechainClient = createL2Client(env)
  try {
    const [records, owner] = await Promise.all([
      getRecords(client, {
        name,
        texts: ['avatar', 'description'],
      }).catch(() => null),
      resolveOwner(client, namechainClient, name),
    ])

    if (!records) {
      return {
        avatar: null,
        description: null,
        owner,
      }
    }

    const avatarRecord =
      records.texts.find((r) => r.key === 'avatar')?.value ?? null

    const avatar = avatarRecord
      ? await resolveAvatarDataUri(client, avatarRecord)
      : null

    return {
      avatar,
      description:
        records.texts.find((r) => r.key === 'description')?.value ?? null,
      owner,
    }
  } catch {
    return { avatar: null, description: null, owner: null }
  }
}

const STATIC_PATH_PREFIXES = [
  '/assets/',
  '/og/',
  '/addr/',
  '/favicon',
  '/manifest',
  '/logo',
] as const

function isAddressRoute(pathname: string): boolean {
  const match = pathname.match(/^\/addr\/(0x[0-9a-fA-F]{40})$/)
  return !!match
}

function isAddrSubpage(pathname: string): boolean {
  const match = pathname.match(/^\/addr\/(0x[0-9a-fA-F]{40})\/[^/]+$/)
  return !!match
}

function extractAddrFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/addr\/(0x[0-9a-fA-F]{40})/)
  return match ? match[1] : null
}

function isProfileRoute(pathname: string): boolean {
  if (!pathname.startsWith('/')) return false
  const segments = pathname.slice(1).split('/')
  if (segments.length < 1 || segments[0] === '') return false

  const name = segments[0]

  // Skip known static paths
  for (const prefix of STATIC_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return false
  }

  // Skip file extensions other than .eth-like names
  if (name.includes('.') && !name.endsWith('.eth')) return false

  return true
}

function extractNameFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/')) return null
  const segments = pathname.slice(1).split('/')
  if (segments.length < 1 || segments[0] === '') return null

  const name = segments[0]

  // Skip known static paths
  for (const prefix of STATIC_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return null
  }

  // Skip file extensions other than .eth-like names
  if (name.includes('.') && !name.endsWith('.eth')) return null

  return name
}

function isNameSubpage(pathname: string): boolean {
  const name = extractNameFromPath(pathname)
  return name !== null
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

interface OgFonts {
  ogSansFont: ArrayBuffer | null
  ogMonoFont: ArrayBuffer | null
  ogSemiMonoFont: ArrayBuffer | null
}

interface OgFontEntry {
  name: string
  data: ArrayBuffer
  weight: number
  style: string
}

async function loadOgFonts(env: Env, requestUrl: string): Promise<OgFonts> {
  const [ogSansFont, ogMonoFont, ogSemiMonoFont] = await Promise.all([
    loadFontData(env, requestUrl, ogSansFontUrl),
    loadFontData(env, requestUrl, ogMonoFontUrl),
    loadFontData(env, requestUrl, ogSemiMonoFontUrl),
  ])
  return { ogSansFont, ogMonoFont, ogSemiMonoFont }
}

function buildOgFontList(fonts: OgFonts): OgFontEntry[] {
  return [
    fonts.ogSansFont
      ? { name: 'OgSans', data: fonts.ogSansFont, weight: 500, style: 'normal' }
      : null,
    fonts.ogMonoFont
      ? { name: 'OgMono', data: fonts.ogMonoFont, weight: 500, style: 'normal' }
      : null,
    fonts.ogSemiMonoFont
      ? {
          name: 'OgSemiMono',
          data: fonts.ogSemiMonoFont,
          weight: 500,
          style: 'normal',
        }
      : null,
  ].filter((f): f is OgFontEntry => f !== null)
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
    <div style="position: absolute; left: 48px; top: 46px; display: flex; align-items: center; gap: 24px;">
      <img src="data:image/svg+xml;base64,${btoa(ensLogoSvg)}" width="164" height="51" style="width: 164px; height: 51px;" />
      <div style="display: flex; align-items: center; gap: 8px; padding-top: 8px;">
        <img src="data:image/svg+xml;base64,${btoa(explorerTextSvg)}" width="174" height="42" style="width: 174px; height: 42px;" />
        <div style="background: #DBF0F8; border-radius: 999px; padding: 2px 6px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 17px; font-weight: 500; color: #0082BB; font-family: 'OgSans', system-ui, sans-serif;">Alpha</span>
        </div>
      </div>
    </div>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function renderOgImage(
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

  const subpageLabels: Record<string, string> = {
    ownership: 'Ownership',
    records: 'Records',
    registry: 'Registry',
    resolver: 'Resolver',
    subnames: 'Subnames',
    roles: 'Roles',
  }
  const pageLabel = subpage
    ? (subpageLabels[subpage] ??
      `${subpage.charAt(0).toUpperCase()}${subpage.slice(1)}`)
    : 'Name Overview'

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

async function renderAddressOgImage(
  address: string,
  requestUrl: string,
  env: Env,
  subpage: string | null = null,
): Promise<Response> {
  const fonts = await loadOgFonts(env, requestUrl)
  const displayAddress = truncateAddress(address, 6, 5)
  const headerHtml = renderOgHeader()

  const addrSubpageLabels: Record<string, string> = {
    names: 'Names',
    history: 'History',
    resolution: 'Address Resolution',
    'reverse-resolution': 'Reverse Resolution',
  }
  const pageLabel = subpage
    ? (addrSubpageLabels[subpage] ??
      `${subpage.charAt(0).toUpperCase()}${subpage.slice(1)}`)
    : 'Address Overview'

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

async function renderDefaultOgImage(
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

class MetaTagInjector {
  readonly #tags: string

  constructor(tags: string) {
    this.#tags = tags
  }

  element(element: Element): void {
    element.append(this.#tags, { html: true })
  }
}

class TitleRewriter {
  readonly #title: string

  constructor(title: string) {
    this.#title = title
  }

  element(element: Element): void {
    element.setInnerContent(this.#title)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    // Default OG image route: /og/default.png
    if (pathname === '/og/default.png') {
      const response = await env.ASSETS.fetch(
        new Request(`${url.origin}/assets/og/default.png`),
      )
      if (response.ok) {
        return new Response(response.body, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          },
        })
      }
      return renderDefaultOgImage(request.url, env)
    }

    // OG image route: /og/:name.png or /og/:name/:subpage.png
    const ogMatch = pathname.match(/^\/og\/(.+)\.png$/)
    if (ogMatch) {
      const decoded = decodeURIComponent(ogMatch[1])
      // Address OG image: /og/addr/0x....png or /og/addr/0x.../subpage.png
      const addrOgMatch = decoded.match(
        /^addr\/(0x[0-9a-fA-F]{40})(?:\/(.+))?$/,
      )
      if (addrOgMatch) {
        const address = addrOgMatch[1]
        const subpage = addrOgMatch[2] ?? null
        return renderAddressOgImage(address, request.url, env, subpage)
      }
      // Name OG image with optional subpage: /og/name/subpage.png
      const nameParts = decoded.split('/')
      const name = nameParts[0]
      const subpage = nameParts[1] ?? null
      const { avatar, owner } = await fetchEnsData(env, name)
      return renderOgImage(name, avatar, owner, request.url, env, subpage)
    }

    // Address page: inject meta tags
    if (isAddressRoute(pathname) || isAddrSubpage(pathname)) {
      const address = decodeURIComponent(extractAddrFromPath(pathname)!)
      const accept = request.headers.get('Accept') ?? ''

      if (!accept.includes('text/html')) {
        return env.ASSETS.fetch(request)
      }

      const response = await env.ASSETS.fetch(request)
      const host = url.host
      const displayAddress = truncateAddress(address, 6, 5)
      const subpage = pathname.split('/').slice(2).join('/')
      const ogImageUrl = subpage
        ? `https://${host}/og/addr/${encodeURIComponent(address)}/${encodeURIComponent(subpage)}.png`
        : `https://${host}/og/addr/${encodeURIComponent(address)}.png`
      const pageTitle = subpage
        ? `${displayAddress} > ${subpage} — ENS Explorer App`
        : `${displayAddress} — ENS Explorer App`
      const desc = `Ethereum address ${displayAddress}`

      const metaTags = [
        `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`,
        `<meta property="og:description" content="${escapeHtml(desc)}" />`,
        `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />`,
        `<meta property="og:type" content="profile" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${escapeHtml(pageTitle)}" />`,
        `<meta name="twitter:description" content="${escapeHtml(desc)}" />`,
        `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />`,
      ].join('\n')

      return new HTMLRewriter()
        .on('head', new MetaTagInjector(metaTags))
        .on('title', new TitleRewriter(pageTitle))
        .transform(response)
    }

    // Name page (including subpages like /name/ownership): inject meta tags
    if (isNameSubpage(pathname)) {
      const name = decodeURIComponent(extractNameFromPath(pathname)!)
      const accept = request.headers.get('Accept') ?? ''

      // Only inject for HTML requests (not JS, CSS, etc.)
      if (!accept.includes('text/html')) {
        return env.ASSETS.fetch(request)
      }

      const [response, ensData] = await Promise.all([
        env.ASSETS.fetch(request),
        fetchEnsData(env, name),
      ])

      const { description, avatar } = ensData
      const host = url.host
      const subpage = pathname.split('/').slice(2).join('/')
      const ogImageUrl = subpage
        ? `https://${host}/og/${encodeURIComponent(name)}/${encodeURIComponent(subpage)}.png`
        : `https://${host}/og/${encodeURIComponent(name)}.png`
      const pageTitle = pathname.split('/').slice(2).join(' > ')
      const profileTitle = pageTitle
        ? `${name} > ${pageTitle} — ENS Explorer App`
        : `${name} — ENS Explorer App`
      const desc = description ?? `ENS profile for ${name}`

      const metaTags = [
        `<meta property="og:title" content="${escapeHtml(profileTitle)}" />`,
        `<meta property="og:description" content="${escapeHtml(desc)}" />`,
        `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />`,
        `<meta property="og:type" content="profile" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${escapeHtml(profileTitle)}" />`,
        `<meta name="twitter:description" content="${escapeHtml(desc)}" />`,
        `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />`,
        avatar
          ? `<meta property="og:image:alt" content="${escapeHtml(name)} avatar" />`
          : '',
      ]
        .filter(Boolean)
        .join('\n')

      return new HTMLRewriter()
        .on('head', new MetaTagInjector(metaTags))
        .on('title', new TitleRewriter(profileTitle))
        .transform(response)
    }

    // All other routes: inject default OG meta tags for HTML requests
    const accept = request.headers.get('Accept') ?? ''
    if (accept.includes('text/html')) {
      const response = await env.ASSETS.fetch(request)
      const host = url.host
      const ogImageUrl = `https://${host}/og/default.png`
      const title = 'ENS Explorer App'
      const desc = 'Explore ENS names and addresses'

      const metaTags = [
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="${escapeHtml(desc)}" />`,
        `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
        `<meta name="twitter:description" content="${escapeHtml(desc)}" />`,
        `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />`,
      ].join('\n')

      return new HTMLRewriter()
        .on('head', new MetaTagInjector(metaTags))
        .transform(response)
    }

    return env.ASSETS.fetch(request)
  },
}
