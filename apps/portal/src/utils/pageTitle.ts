import {
  extractAddrFromPath,
  extractNameFromPath,
  extractRegisterName,
  extractTldFromPath,
  isAddressRoute,
  isAddrSubpage,
  isTldRoute,
  matchContractRoute,
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
  searchParams: URLSearchParams,
): string | null => {
  const name = extractRegisterName(pathname, searchParams)

  return name ? withSuffix(decodeURIComponent(name)) : null
}

const tldTitle = (pathname: string): string | null => {
  if (!isTldRoute(pathname)) return null

  const tld = extractTldFromPath(pathname)

  return tld ? withSuffix(decodeURIComponent(tld)) : null
}

/**
 * Document title for a pathname, shared by the worker's meta injection and the
 * client's title updates so a page reads the same before and after hydration.
 *
 * Matched most-specific first, mirroring `handlePageMeta`.
 */
export function getPageTitle(
  pathname: string,
  searchParams: URLSearchParams = new URLSearchParams(),
): string {
  return (
    addressTitle(pathname) ??
    contractTitle(pathname) ??
    nameTitle(pathname) ??
    registerTitle(pathname, searchParams) ??
    tldTitle(pathname) ??
    TITLE_SUFFIX
  )
}
