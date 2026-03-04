import { extendChainWithL1Ens } from '@ensdomains/ensjs/chain'
import { getRecords } from '@ensdomains/ensjs/public'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { ImageResponse } from 'workers-og'

const SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aQfci4RAcMR8bLtehXRfUMv'

const client = createPublicClient({
  chain: extendChainWithL1Ens(sepolia),
  transport: http(SEPOLIA_RPC_URL),
})

async function fetchEnsData(name: string) {
  try {
    const records = await getRecords(client, {
      name,
      texts: ['avatar', 'description'],
    })
    return {
      avatar: records.texts.find((r) => r.key === 'avatar')?.value ?? null,
      description:
        records.texts.find((r) => r.key === 'description')?.value ?? null,
    }
  } catch {
    return { avatar: null, description: null }
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderOgImage(
  name: string,
  avatar: string | null,
  description: string | null,
): Response {
  const avatarHtml = avatar
    ? `<img src="${escapeHtml(avatar)}" width="120" height="120" style="border-radius: 60px; margin-right: 32px;" />`
    : `<div style="display: flex; align-items: center; justify-content: center; width: 120px; height: 120px; border-radius: 60px; background: rgba(255,255,255,0.15); margin-right: 32px; font-size: 48px; color: white;">${escapeHtml(name.charAt(0).toUpperCase())}</div>`

  const descriptionHtml = description
    ? `<p style="font-size: 24px; color: rgba(255,255,255,0.8); margin: 0; max-width: 800px; line-height: 1.4;">${escapeHtml(truncate(description, 120))}</p>`
    : ''

  const html = `
    <div style="display: flex; flex-direction: column; width: 100%; height: 100%; background: linear-gradient(135deg, #5B41C6 0%, #3889E8 50%, #56B8EC 100%); padding: 60px; font-family: sans-serif; color: white;">
      <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
        <div style="display: flex; align-items: center;">
          ${avatarHtml}
          <h1 style="font-size: 56px; font-weight: 700; margin: 0;">${escapeHtml(name)}</h1>
        </div>
        <div style="display: flex; flex-direction: column;">
          ${descriptionHtml}
        </div>
        <div style="display: flex; align-items: center; justify-content: flex-end;">
          <span style="font-size: 20px; font-weight: 600; opacity: 0.9;">ENS</span>
        </div>
      </div>
    </div>
  `

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    headers: {
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
  async fetch(
    request: Request,
    env: { ASSETS: { fetch: (req: Request) => Promise<Response> } },
  ): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    // OG image route: /og/:name.png
    const ogMatch = pathname.match(/^\/og\/(.+)\.png$/)
    if (ogMatch) {
      const name = decodeURIComponent(ogMatch[1])
      const { avatar, description } = await fetchEnsData(name)
      return renderOgImage(name, avatar, description)
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
