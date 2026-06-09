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
 * CLIENT-ONLY: is a Privy session persisted? Privy stores its token in a cookie
 * (not localStorage). The reconnect-gap guards (useOnDisconnected,
 * ConnectionCookieSync, WalletLifecycle) use it to tell a real disconnect from
 * the brief reload window before the bridge reconnects. Not isomorphic — it also
 * runs in unit/e2e without a server context (getCookie would throw).
 *
 * ⚠️ Assumes Privy's "HttpOnly cookies" is OFF (default). If turned on, the
 * cookie is JS-unreadable and these client guards need a usePrivy() signal
 * instead (the isomorphic SSR guard below still works). See docs/PRIVY.md.
 */
export function hasStoredPrivySession(): boolean {
  if (typeof document === 'undefined') return false
  try {
    return cookieStringHasPrivyToken(document.cookie)
  } catch {
    return false
  }
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
