import { getGlobalStartContext } from '@tanstack/react-start'

// Cloudflare doesn't expose NODE_ENV, so checking the source branch is our easiest workaround
const IS_PROD = process.env.CF_PAGES_BRANCH === 'master'
// On production builds, CF_PAGES_URL points to a Cloudflare preview URL rather than the production domain.
// We default to ens.domains when CF_PAGES_BRANCH is 'master' OR when CF_PAGES_URL is unset.
export const BASE_URL = new URL(
  (!IS_PROD && process.env.CF_PAGES_URL) || 'https://ens.domains',
)

/**
 * Origin the app is currently served from.
 *
 * `og:image` has to be absolute, and this app has no single public hostname —
 * it is reached over workers.dev and per-deployment preview URLs too — so the
 * origin is taken from the request being rendered (stashed on the request
 * context in `start.ts`) and from `location` once hydrated. `BASE_URL` is the
 * last resort, for renders that happen outside a request.
 */
export const getSiteOrigin = (): string => {
  if (typeof window !== 'undefined') return window.location.origin

  return getGlobalStartContext()?.origin ?? BASE_URL.origin
}

/** Social card for every route that isn't a name. */
export const defaultOgImageUrl = (): string =>
  new URL('/og/default.png', getSiteOrigin()).toString()

/** Social card for a name's profile. */
export const nameOgImageUrl = (name: string): string =>
  new URL(`/og/${encodeURIComponent(name)}.png`, getSiteOrigin()).toString()

export const seo = ({
  title,
  description,
  keywords,
  image,
}: {
  title: string
  description?: string
  image?: string
  keywords?: string
}) => {
  const tags = [
    { title },
    { name: 'description', content: description },
    { name: 'keywords', content: keywords },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:creator', content: '@ensdomains' },
    { name: 'twitter:site', content: '@ensdomains' },
    // Open Graph is keyed on `property`, not `name` — Facebook and LinkedIn
    // only read the former. It is also what the router dedupes head tags by, so
    // a route's own og:image replaces the root's default rather than joining it.
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    ...(image
      ? [
          { name: 'twitter:image', content: image },
          { name: 'twitter:card', content: 'summary_large_image' },
          { property: 'og:image', content: image },
        ]
      : []),
  ]

  return tags
}
