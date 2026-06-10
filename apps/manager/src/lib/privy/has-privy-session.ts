import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

const PRIVY_TOKEN_COOKIE = 'privy-token'

const hasValue = (raw: string | null | undefined): boolean =>
  typeof raw === 'string' && raw.length > 0

/** Does a `document.cookie` string hold a non-empty `privy-token`? (exact name) */
export const cookieStringHasPrivyToken = (cookieString: string): boolean => {
  const row = cookieString
    .split('; ')
    .find((entry) => entry.startsWith(`${PRIVY_TOKEN_COOKIE}=`))
  return hasValue(row?.slice(`${PRIVY_TOKEN_COOKIE}=`.length))
}

/**
 * CLIENT-ONLY: is a Privy session persisted? (Privy's token is a cookie, not
 * localStorage.) The reconnect-gap guards use it to distinguish a real
 * disconnect from the reload window. Not isomorphic — also runs in unit/e2e.
 *
 * ⚠️ Assumes Privy "HttpOnly cookies" is OFF (default); if on, these client
 * guards need a usePrivy() signal instead (the SSR guard below still works).
 */
export function hasStoredPrivySession(): boolean {
  if (typeof document === 'undefined') return false
  try {
    return cookieStringHasPrivyToken(document.cookie)
  } catch {
    return false
  }
}

/** True on the page Privy redirects back to after social login (URL carries `privy_oauth_code`). */
export function isPrivyOAuthRedirect(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('privy_oauth_code')
}

/**
 * ISOMORPHIC check for route `beforeLoad` guards: server reads via getCookie
 * (works even with HttpOnly on); client falls back to document.cookie.
 */
export const hasPrivySessionCookie = createIsomorphicFn()
  .server(() => hasValue(getCookie(PRIVY_TOKEN_COOKIE)))
  .client(() =>
    typeof document === 'undefined'
      ? false
      : cookieStringHasPrivyToken(document.cookie),
  )
