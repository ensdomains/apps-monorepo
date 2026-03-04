import { extendChainWithL1Ens } from '@ensdomains/ensjs/chain'
import { getRecords } from '@ensdomains/ensjs/public'
import { getOwner } from '@ensdomains/ensjs/public/v1'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { parseAvatarRecord } from 'viem/ens'
import { ImageResponse } from 'workers-og'
import monumentMonoMediumUrl from './assets/fonts/ABCMonumentGroteskMono/abc-monument-grotesk-mono-medium.ttf?url'
import monumentSemiMonoMediumUrl from './assets/fonts/ABCMonumentGroteskSemiMono/abc-monument-grotesk-semi-mono-medium.ttf?url'
import monumentGroteskVariableUrl from './assets/fonts/abc-monument-grotesk-variable.ttf?url'

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
        if (res.ok) return await res.arrayBuffer()
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

function renderOgImage(
  name: string,
  avatar: string | null,
  owner: string | null,
  requestUrl: string,
  env: WorkerEnv,
): Promise<Response> {
  return (async () => {
    const [groteskVariableFont, monoMediumFont, semiMonoMediumFont] =
      await Promise.all([
        loadFontData(env, requestUrl, monumentGroteskVariableUrl),
        loadFontData(env, requestUrl, monumentMonoMediumUrl),
        loadFontData(env, requestUrl, monumentSemiMonoMediumUrl),
      ])

    const displayName = truncate(name, 24)
    const displayAddress = owner ? truncateAddress(owner, 6, 5) : 'No owner'

    const avatarHtml = avatar
      ? `<img src="${escapeHtml(avatar)}" width="140" height="140" style="width: 140px; height: 140px; border-radius: 8px; object-fit: cover;" />`
      : `<div style="width: 140px; height: 140px; border-radius: 8px; background: #0082BB; display: flex; align-items: center; justify-content: center; color: white; font-size: 48px; font-weight: 600; font-family: 'ABCMonumentGroteskSemiMono', ui-monospace, monospace;">${escapeHtml(name.charAt(0).toUpperCase())}</div>`

    const html = `
    <div style="position: relative; width: 100%; height: 100%; background: #ECECEC; display: flex; align-items: center; justify-content: center; padding: 100px; box-sizing: border-box;">
      <div style="display: flex; align-items: center; gap: 48px; width: 100%;">
        <div style="width: 140px; height: 140px; border-radius: 8px; background: #0082BB; overflow: hidden; flex-shrink: 0; display: flex;">${avatarHtml}</div>
        <div style="display: flex; flex-direction: column; gap: 20px; color: #191919; min-width: 0; flex: 1;">
          <h1 style="margin: 0; font-size: 82px; line-height: 0.95; font-weight: 500; font-family: 'ABCMonumentGroteskSemiMono', ui-monospace, monospace; white-space: nowrap; overflow: hidden;">
            ${escapeHtml(displayName)}
          </h1>
          <p style="margin: 0; font-size: 40px; line-height: 0.75; font-weight: 500; font-family: 'ABCMonumentGroteskMono', ui-monospace, monospace; white-space: nowrap; overflow: hidden;">
            ${escapeHtml(displayAddress)}
          </p>
        </div>
      </div>
      <div style="position: absolute; left: 48px; top: 46px; display: flex; align-items: center; gap: 24px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <svg width="44" height="51" viewBox="0 0 25 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.9463 0.260315L4.21335 12.9848C4.15271 13.0845 4.0118 13.0957 3.93658 13.0063C3.25581 12.198 0.719559 8.75899 3.8579 5.62454C6.72166 2.76435 10.3693 0.725098 11.7211 0.0202894C11.8745 -0.0596746 12.0361 0.112611 11.9463 0.260315Z" fill="#002335"/>
            <path d="M11.5195 27.964C11.6738 28.072 11.864 27.8878 11.7606 27.7305C10.0333 25.1033 4.29168 16.3619 3.49855 15.0497C2.71624 13.7554 1.17757 11.6044 1.04922 9.76415C1.03641 9.58043 0.782377 9.54313 0.718475 9.71589C0.615416 9.99453 0.505695 10.3271 0.403435 10.707C-0.887502 15.5027 0.987334 20.5916 5.05909 23.4418L11.5195 27.964V27.964Z" fill="#002335"/>
            <path d="M12.5805 27.7397L20.3134 15.0152C20.374 14.9154 20.515 14.9043 20.5902 14.9936C21.2709 15.802 23.8072 19.241 20.6689 22.3754C17.8051 25.2356 14.1575 27.2749 12.8056 27.9797C12.6523 28.0597 12.4907 27.8874 12.5805 27.7397Z" fill="#002335"/>
            <path d="M13.0191 0.0323484C12.8647 -0.0756772 12.6746 0.108548 12.778 0.265871C14.5052 2.89309 20.2469 11.6345 21.04 12.9467C21.8223 14.241 23.361 16.3919 23.4894 18.2322C23.5022 18.4159 23.7562 18.4532 23.8201 18.2805C23.9232 18.0018 24.0329 17.6693 24.1351 17.2894C25.4261 12.4936 23.5512 7.40472 19.4795 4.55456L13.0191 0.0323484Z" fill="#002335"/>
          </svg>
          <span style="font-size: 50px; line-height: 1; font-weight: 500; color: #002335; font-family: 'ABCMonumentGrotesk', system-ui, sans-serif;">ens</span>
          <span style="font-size: 50px; line-height: 1; font-weight: 500; color: #0082BB; font-family: 'ABCMonumentGrotesk', system-ui, sans-serif;">Explorer</span>
        </div>
        <div style="background: #DBF0F8; border-radius: 999px; padding: 2px 8px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 17px; font-weight: 500; color: #0082BB; font-family: 'ABCMonumentGrotesk', system-ui, sans-serif;">Alpha</span>
        </div>
      </div>
      <div style="position: absolute; right: 48px; bottom: 70px; transform: translateY(50%); font-size: 49px; line-height: 1; color: #000000; font-family: 'ABCMonumentGrotesk', system-ui, sans-serif; font-weight: 500; text-align: right; display: flex;">
        Name Overview
      </div>
    </div>
  `

    return new ImageResponse(html, {
      width: 1200,
      height: 630,
      fonts: [
        groteskVariableFont
          ? {
              name: 'ABCMonumentGrotesk',
              data: groteskVariableFont,
              weight: 500,
              style: 'normal',
            }
          : null,
        monoMediumFont
          ? {
              name: 'ABCMonumentGroteskMono',
              data: monoMediumFont,
              weight: 500,
              style: 'normal',
            }
          : null,
        semiMonoMediumFont
          ? {
              name: 'ABCMonumentGroteskSemiMono',
              data: semiMonoMediumFont,
              weight: 500,
              style: 'normal',
            }
          : null,
      ].filter(Boolean),
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  })()
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
