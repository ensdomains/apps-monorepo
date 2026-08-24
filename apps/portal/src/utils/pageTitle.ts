import {
  extractAddrFromPath,
  extractNameFromPath,
  extractTldFromPath,
  isAddressRoute,
  isAddrSubpage,
  isTldRoute,
  matchContractRoute,
  normalizeRegisterName,
  truncateAddress,
} from './routePaths'

export const TITLE_SUFFIX = 'ENS Explorer App'

const withSuffix = (subject: string, subpage = '') =>
  subpage
    ? `${subject} > ${subpage} — ${TITLE_SUFFIX}`
    : `${subject} — ${TITLE_SUFFIX}`

const addressTitle = (pathname: string): string | null => {
  if (!isAddressRoute(pathname) && !isAddrSubpage(pathname)) return null

  const address = extractAddrFromPath(pathname)
  if (!address) return null

  const segments = pathname.split('/')

  return withSuffix(
    truncateAddress(decodeURIComponent(address), 6, 5),
    segments.length > 3 ? segments.slice(3).join('/') : '',
  )
}

const contractTitle = (pathname: string): string | null => {
  for (const kind of ['resolver', 'registry'] as const) {
    const route = matchContractRoute(pathname, kind)
    if (!route) continue

    const label = kind === 'resolver' ? 'Resolver' : 'Registry'
    const display = truncateAddress(decodeURIComponent(route.address), 6, 5)

    return withSuffix(`${label} ${display}`, route.subpage ?? '')
  }

  return null
}

const nameTitle = (pathname: string): string | null => {
  const name = extractNameFromPath(pathname)
  if (!name) return null

  // Name subpages join with ' > ', address subpages with '/'
  const segments = pathname.split('/')

  return withSuffix(
    decodeURIComponent(name),
    segments.length > 2 ? segments.slice(2).join(' > ') : '',
  )
}

const registerTitle = (
  pathname: string,
  registerName: string | undefined,
): string | null => {
  const name = normalizeRegisterName(pathname, registerName)

  return name ? withSuffix(decodeURIComponent(name)) : null
}

const tldTitle = (pathname: string): string | null => {
  if (!isTldRoute(pathname)) return null

  const tld = extractTldFromPath(pathname)

  return tld ? withSuffix(decodeURIComponent(tld)) : null
}

/**
 * Document title for a pathname, shared by the worker's meta injection and the
 * client's `head`, so both sides format a page the same way.
 *
 * Matched most-specific first, mirroring `handlePageMeta`.
 *
 * The two sides can still disagree on a URL that no route matches exactly. The
 * client can only pass the deepest *matched* route, so with the router's fuzzy
 * not-found matching `/nick.eth/bogus` arrives here as `/nick.eth` and is
 * titled `nick.eth`, where the worker saw the full path and served
 * `nick.eth > bogus`. `head` has no access to the location, and it need not
 * re-run when only an unmatched segment changes, so this is a known gap rather
 * than something the caller can correct.
 *
 * @param registerName the raw `?name=` value; only `/register` reads it
 */
export function getPageTitle(pathname: string, registerName?: string): string {
  return (
    addressTitle(pathname) ??
    contractTitle(pathname) ??
    nameTitle(pathname) ??
    registerTitle(pathname, registerName) ??
    tldTitle(pathname) ??
    TITLE_SUFFIX
  )
}
