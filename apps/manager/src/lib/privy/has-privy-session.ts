import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

const PRIVY_TOKEN_COOKIE = 'privy-token'

const hasValue = (raw: string | null | undefined): boolean =>
  typeof raw === 'string' && raw.length > 0

/**
 * Pure: does a `document.cookie`-style string contain a non-empty `privy-token`?
 * Exported for testing and reuse; matches the exact cookie name (not a
 * lookalike like `not-privy-token`).
 */
export const cookieStringHasPrivyToken = (cookieString: string): boolean => {
  const row = cookieString
    .split('; ')
    .find((entry) => entry.startsWith(`${PRIVY_TOKEN_COOKIE}=`))
  return hasValue(row?.slice(`${PRIVY_TOKEN_COOKIE}=`.length))
}

/**
 * CLIENT-ONLY check for a persisted Privy session, via `document.cookie`.
 *
 * Privy stores its auth token in a COOKIE named `privy-token` (not
 * localStorage). Used by the runtime reconnect-gap guards (`useOnDisconnected`,
 * `ConnectionCookieSync`, `WalletLifecycle`) to tell a real disconnect from the
 * brief reload window where wagmi has dropped the Privy connector (its
 * in-memory signer doesn't survive reload) but Privy will restore the session.
 *
 * Deliberately NOT isomorphic: these guards also run in unit tests / e2e
 * without a server request context, where `getCookie()` would throw.
 *
 * ⚠️ Requires Privy's "HttpOnly cookies" setting OFF (current/default). If
 * enabled for production the cookie becomes JS-unreadable; the client guards
 * would then need a `usePrivy()`-based signal instead (the SSR guard below
 * already works either way). See docs/PRIVY.md.
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
 * ISOMORPHIC check for the Privy session cookie, for route `beforeLoad` guards.
 *
 * Server-side reads via `getCookie` — which works even with HttpOnly cookies
 * ON — so the SSR redirect guard stays correct regardless of that setting.
 * Client-side falls back to `document.cookie`.
 */
export const hasPrivySessionCookie = createIsomorphicFn()
  .server(() => hasValue(getCookie(PRIVY_TOKEN_COOKIE)))
  .client(() =>
    typeof document === 'undefined'
      ? false
      : cookieStringHasPrivyToken(document.cookie),
  )
