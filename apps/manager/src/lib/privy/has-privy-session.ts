const PRIVY_TOKEN_COOKIE = 'privy-token'

/**
 * Client-side check for a persisted Privy session.
 *
 * Privy stores its auth token in a COOKIE named `privy-token` (not
 * localStorage). We read it to distinguish a real disconnect from the brief
 * reload window where wagmi has dropped the Privy connector — the connector's
 * in-memory signer doesn't survive a page reload, so wagmi reports
 * "disconnected" until Privy restores the session and the bridge reconnects.
 * A real `privy.logout()` clears the cookie, so genuine disconnects still read
 * as disconnected.
 *
 * Provider-independent on purpose — callers like `useOnDisconnected` and
 * `ConnectionCookieSync` also run when no PrivyProvider is mounted (e.g. e2e
 * with VITE_PRIVY_APP_ID unset), where `usePrivy()` would throw.
 *
 * NOTE: reads the cookie via `document.cookie`, which requires Privy's
 * "HttpOnly cookies" setting to be OFF (the current/default). If HttpOnly is
 * enabled for production, this becomes JS-unreadable and needs a
 * server-readable signal instead (e.g. checking the cookie in `beforeLoad`).
 */
export function hasStoredPrivySession(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const row = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${PRIVY_TOKEN_COOKIE}=`))
    return !!row && row.slice(`${PRIVY_TOKEN_COOKIE}=`.length).length > 0
  } catch {
    return false
  }
}
