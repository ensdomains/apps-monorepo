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
} from './routing'

export const TITLE_SUFFIX = 'ENS Explorer App'

/**
 * Document title for a pathname, shared by the worker's meta injection and the
 * client's title updates so a page reads the same before and after hydration.
 *
 * Routes are matched most-specific first, mirroring `handlePageMeta`.
 */
export function getPageTitle(
  pathname: string,
  searchParams: URLSearchParams = new URLSearchParams(),
): string {
  const segments = pathname.split('/')

  if (isAddressRoute(pathname) || isAddrSubpage(pathname)) {
    const address = extractAddrFromPath(pathname)

    if (address) {
      const display = truncateAddress(decodeURIComponent(address), 6, 5)
      const subpage = segments.length > 3 ? segments.slice(3).join('/') : ''

      return subpage
        ? `${display} > ${subpage} — ${TITLE_SUFFIX}`
        : `${display} — ${TITLE_SUFFIX}`
    }
  }

  for (const kind of ['resolver', 'registry'] as const) {
    const route = matchContractRoute(pathname, kind)

    if (route) {
      const label = kind === 'resolver' ? 'Resolver' : 'Registry'
      const display = truncateAddress(decodeURIComponent(route.address), 6, 5)

      return route.subpage
        ? `${label} ${display} > ${route.subpage} — ${TITLE_SUFFIX}`
        : `${label} ${display} — ${TITLE_SUFFIX}`
    }
  }

  const name = extractNameFromPath(pathname)

  if (name) {
    // Name subpages join with ' > ', address subpages with '/'
    const subpageTitle =
      segments.length > 2 ? segments.slice(2).join(' > ') : ''

    return subpageTitle
      ? `${decodeURIComponent(name)} > ${subpageTitle} — ${TITLE_SUFFIX}`
      : `${decodeURIComponent(name)} — ${TITLE_SUFFIX}`
  }

  const registerName = extractRegisterName(pathname, searchParams)

  if (registerName) {
    return `${decodeURIComponent(registerName)} — ${TITLE_SUFFIX}`
  }

  if (isTldRoute(pathname)) {
    const tld = extractTldFromPath(pathname)

    if (tld) return `${decodeURIComponent(tld)} — ${TITLE_SUFFIX}`
  }

  return TITLE_SUFFIX
}
