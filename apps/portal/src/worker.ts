import { fetchEnsData } from './worker/ens'
import { MetaTagInjector, TitleRewriter } from './worker/html-rewriter'
import {
  escapeHtml,
  renderAddressOgImage,
  renderDefaultOgImage,
  renderOgImage,
  renderTldOgImage,
} from './worker/og-render'
import {
  extractAddrFromPath,
  extractNameFromPath,
  extractTldFromPath,
  isAddressRoute,
  isAddrSubpage,
  isTldRoute,
  truncateAddress,
} from './worker/routing'

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
      // TLD OG image: /og/tld/:tld.png
      const tldOgMatch = decoded.match(/^tld\/(.+)$/)
      if (tldOgMatch) {
        const tld = tldOgMatch[1]
        return renderTldOgImage(tld, request.url, env)
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
      const address = extractAddrFromPath(pathname)
      if (!address) {
        return env.ASSETS.fetch(request)
      }
      const decodedAddress = decodeURIComponent(address)
      const accept = request.headers.get('Accept') ?? ''

      if (!accept.includes('text/html') && !accept.includes('*/*')) {
        return env.ASSETS.fetch(request)
      }

      const response = await env.ASSETS.fetch(request)
      const host = url.host
      const displayAddress = truncateAddress(decodedAddress, 6, 5)
      const pathSegments = pathname.split('/')
      const subpage =
        pathSegments.length > 3 ? pathSegments.slice(3).join('/') : ''
      const ogImageUrl = subpage
        ? `https://${host}/og/addr/${encodeURIComponent(decodedAddress)}/${encodeURIComponent(subpage)}.png`
        : `https://${host}/og/addr/${encodeURIComponent(decodedAddress)}.png`
      const pageTitle = subpage
        ? `${displayAddress} > ${subpage} — ENS Explorer App`
        : `${displayAddress} — ENS Explorer App`
      const desc = `Ethereum address ${decodedAddress}`

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
    const name = extractNameFromPath(pathname)
    if (name) {
      const decodedName = decodeURIComponent(name)
      const accept = request.headers.get('Accept') ?? ''

      // Only inject for HTML requests (not JS, CSS, etc.)
      if (!accept.includes('text/html') && !accept.includes('*/*')) {
        return env.ASSETS.fetch(request)
      }

      const [response, ensData] = await Promise.all([
        env.ASSETS.fetch(request),
        fetchEnsData(env, decodedName),
      ])

      const { description, avatar } = ensData
      const host = url.host
      const namePathSegments = pathname.split('/')
      const subpage =
        namePathSegments.length > 2 ? namePathSegments.slice(2).join('/') : ''
      const ogImageUrl = subpage
        ? `https://${host}/og/${encodeURIComponent(decodedName)}/${encodeURIComponent(subpage)}.png`
        : `https://${host}/og/${encodeURIComponent(decodedName)}.png`
      const pageTitle =
        namePathSegments.length > 2 ? namePathSegments.slice(2).join(' > ') : ''
      const profileTitle = pageTitle
        ? `${decodedName} > ${pageTitle} — ENS Explorer App`
        : `${decodedName} — ENS Explorer App`
      const desc = description ?? `ENS profile for ${decodedName}`

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
          ? `<meta property="og:image:alt" content="${escapeHtml(decodedName)} avatar" />`
          : '',
      ]
        .filter(Boolean)
        .join('\n')

      return new HTMLRewriter()
        .on('head', new MetaTagInjector(metaTags))
        .on('title', new TitleRewriter(profileTitle))
        .transform(response)
    }

    // TLD page: inject meta tags
    if (isTldRoute(pathname)) {
      const tld = extractTldFromPath(pathname)
      if (!tld) {
        return env.ASSETS.fetch(request)
      }
      const decodedTld = decodeURIComponent(tld)
      const accept = request.headers.get('Accept') ?? ''

      if (!accept.includes('text/html') && !accept.includes('*/*')) {
        return env.ASSETS.fetch(request)
      }

      const response = await env.ASSETS.fetch(request)
      const host = url.host
      const ogImageUrl = `https://${host}/og/tld/${encodeURIComponent(decodedTld)}.png`
      const pageTitle = `${decodedTld} — ENS Explorer App`
      const desc = `ENS Top Level Domain ${decodedTld}`

      const metaTags = [
        `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`,
        `<meta property="og:description" content="${escapeHtml(desc)}" />`,
        `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />`,
        `<meta property="og:type" content="website" />`,
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

    // All other routes: inject default OG meta tags for HTML requests
    const accept = request.headers.get('Accept') ?? ''
    if (accept.includes('text/html') || accept.includes('*/*')) {
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
