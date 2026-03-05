import { extendChainWithL1Ens } from '@ensdomains/ensjs/chain'
import { getRecords } from '@ensdomains/ensjs/public'
import { getOwner } from '@ensdomains/ensjs/public/v1'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { parseAvatarRecord } from 'viem/ens'
import { ImageResponse } from 'workers-og'
import ogSansFontUrl from './assets/fonts/og/abc-monument-grotesk-medium.ttf?url'
import ogMonoFontUrl from './assets/fonts/og/abc-monument-grotesk-mono-medium.ttf?url'
import ogSemiMonoFontUrl from './assets/fonts/og/abc-monument-grotesk-semi-mono-medium.ttf?url'
import ensLogoSvg from './assets/fonts/og/ens-logo.svg?raw'
import ensMarkSvg from './assets/fonts/og/ens-mark.svg?raw'
import explorerTextSvg from './assets/fonts/og/explorer-text.svg?raw'

const SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aQfci4RAcMR8bLtehXRfUMv'

const client = createPublicClient({
  chain: extendChainWithL1Ens(sepolia),
  transport: http(SEPOLIA_RPC_URL),
})

type WorkerEnv = {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

const fontCache = new Map<string, Promise<ArrayBuffer | null>>()

function isSupportedSfnt(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false
  const sig = new DataView(buffer, 0, 4).getUint32(0, false)

  // TrueType: 0x00010000, OpenType(CFF): "OTTO", TrueType Collection: "ttcf"
  return sig === 0x00010000 || sig === 0x4f54544f || sig === 0x74746366
}

function loadFontData(
  env: WorkerEnv,
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

async function fetchEnsData(name: string) {
  try {
    const [records, ownerRecord] = await Promise.all([
      getRecords(client, {
        name,
        texts: ['avatar', 'description'],
      }).catch(() => null),
      getOwner(client, { name }).catch(() => null),
    ])

    if (!records) {
      return {
        avatar: null,
        description: null,
        owner: ownerRecord?.owner ?? null,
      }
    }

    const avatarRecord =
      records.texts.find((r) => r.key === 'avatar')?.value ?? null

    const avatar = avatarRecord
      ? await resolveAvatarDataUri(avatarRecord)
      : null

    return {
      avatar,
      description:
        records.texts.find((r) => r.key === 'description')?.value ?? null,
      owner: ownerRecord?.owner ?? null,
    }
  } catch {
    return { avatar: null, description: null, owner: null }
  }
}

const STATIC_PATH_PREFIXES = [
  '/assets/',
  '/og/',
  '/favicon',
  '/manifest',
  '/logo',
]

function isProfileRoute(pathname: string): boolean {
  // Must be a single path segment like /nick.eth
  if (!pathname.startsWith('/')) return false
  const segments = pathname.slice(1).split('/')
  if (segments.length !== 1 || segments[0] === '') return false

  const name = segments[0]

  // Skip known static paths
  for (const prefix of STATIC_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return false
  }

  // Skip file extensions other than .eth-like names
  if (name.includes('.') && !name.endsWith('.eth')) return false

  return true
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function truncateAddress(
  value: string,
  startChars: number = 6,
  endChars: number = 5,
): string {
  if (value.length <= startChars + endChars) return value
  return `${value.slice(0, startChars)}…${value.slice(-endChars)}`
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
  env: WorkerEnv,
): Promise<Response> {
  const [ogSansFont, ogMonoFont, ogSemiMonoFont] = await Promise.all([
    loadFontData(env, requestUrl, ogSansFontUrl),
    loadFontData(env, requestUrl, ogMonoFontUrl),
    loadFontData(env, requestUrl, ogSemiMonoFontUrl),
  ])

  const available = !owner
  const displayName = truncate(name, 28)

  const headerHtml = `
      <div style="position: absolute; left: 48px; top: 46px; display: flex; align-items: center; gap: 24px;">
        <img src="data:image/svg+xml;base64,${btoa(ensLogoSvg)}" width="164" height="51" style="width: 164px; height: 51px;" />
        <div style="display: flex; align-items: center; gap: 8px; padding-top: 8px;">
          <img src="data:image/svg+xml;base64,${btoa(explorerTextSvg)}" width="174" height="42" style="width: 174px; height: 42px;" />
          <div style="background: #DBF0F8; border-radius: 999px; padding: 2px 6px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 17px; font-weight: 500; color: #0082BB; font-family: 'OgSans', system-ui, sans-serif;">Alpha</span>
          </div>
        </div>
      </div>`

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
        Name Overview
      </div>
    </div>
  `
  }

  const imageResponse = new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      ogSansFont
        ? {
            name: 'OgSans',
            data: ogSansFont,
            weight: 500,
            style: 'normal',
          }
        : null,
      ogMonoFont
        ? {
            name: 'OgMono',
            data: ogMonoFont,
            weight: 500,
            style: 'normal',
          }
        : null,
      ogSemiMonoFont
        ? {
            name: 'OgSemiMono',
            data: ogSemiMonoFont,
            weight: 500,
            style: 'normal',
          }
        : null,
    ].filter(Boolean),
  })

  // Materialize the body to catch rendering errors that workers-og
  // would otherwise swallow inside its ReadableStream, producing 0 bytes.
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

class MetaTagInjector {
  private tags: string

  constructor(tags: string) {
    this.tags = tags
  }

  element(element: Element) {
    element.append(this.tags, { html: true })
  }
}

class TitleRewriter {
  private title: string

  constructor(title: string) {
    this.title = title
  }

  element(element: Element) {
    element.setInnerContent(this.title)
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    // OG image route: /og/:name.png
    const ogMatch = pathname.match(/^\/og\/(.+)\.png$/)
    if (ogMatch) {
      const name = decodeURIComponent(ogMatch[1])
      const { avatar, owner } = await fetchEnsData(name)
      return renderOgImage(name, avatar, owner, request.url, env)
    }

    // Profile page: inject meta tags
    if (isProfileRoute(pathname)) {
      const name = decodeURIComponent(pathname.slice(1))
      const accept = request.headers.get('Accept') ?? ''

      // Only inject for HTML requests (not JS, CSS, etc.)
      if (!accept.includes('text/html')) {
        return env.ASSETS.fetch(request)
      }

      const [response, ensData] = await Promise.all([
        env.ASSETS.fetch(request),
        fetchEnsData(name),
      ])

      const { description, avatar } = ensData
      const host = url.host
      const ogImageUrl = `https://${host}/og/${encodeURIComponent(name)}.png`
      const profileTitle = `${name} — ENS Explorer App`
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

    // All other routes: passthrough
    return env.ASSETS.fetch(request)
  },
}
