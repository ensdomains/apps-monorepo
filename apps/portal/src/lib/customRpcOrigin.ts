import { fromSync } from '@ens-apps/utils/neverthrow'

// The custom RPC's origin, set by the SPA and added to connect-src by the
// worker. Only the origin travels: the full URL often embeds an API key, and
// cookies reach the server on every request. `__Host-` keeps sibling
// subdomains from planting it.
export const CUSTOM_RPC_COOKIE = '__Host-custom-rpc-origin'
// A newly entered RPC's origin. The next load allows it too, so the page can
// check the RPC before it replaces the active one.
export const CUSTOM_RPC_CANDIDATE_COOKIE = '__Host-custom-rpc-candidate'

const SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:'])
// CSP host-source grammar: no IPv6 literals or `_`; IDNs arrive as punycode.
const CSP_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/

/** `scheme://host[:port]` of `value`, or null when a CSP source can't express it. */
export const toCspOrigin = (value: string): string | null => {
  const parsed = fromSync(
    () => new URL(value),
    () => null,
  )
  if (parsed.isErr()) return null
  const url = parsed.value
  if (!SCHEMES.has(url.protocol) || url.username || url.password) return null
  if (!CSP_HOST.test(url.hostname)) return null
  return `${url.protocol}//${url.host}`
}

/** Cookie `name` from a `Cookie` header or `document.cookie`. */
export const readCookie = (cookies: string, name: string): string | null => {
  for (const pair of cookies.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1 || pair.slice(0, separator).trim() !== name) continue
    return fromSync(
      () => decodeURIComponent(pair.slice(separator + 1).trim()),
      () => null,
    ).unwrapOr(null)
  }
  return null
}
