import { useEffect, useRef } from 'react'
import { useConnection } from 'wagmi'
import { setConnectionCookie } from './connection-cookie'
import { hasStoredPrivySession } from './privy/has-privy-session'

/**
 * ConnectionCookieSync
 *
 * Mirrors the connected wallet address from wagmi into the connection
 * cookie so server-side route guards can read it. Renders nothing.
 */
export const ConnectionCookieSync = () => {
  const { address, isReconnecting } = useConnection()
  // `undefined` = not yet synced. Distinguishing it from `null` (no wallet)
  // ensures the first settled run clears a stale cookie when wagmi restores
  // no address on load — otherwise SSR guards keep treating it as connected.
  const previousAddressRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    // Wait until reconnection settles so we don't clear the cookie during the
    // brief window where the connector is still restoring the session.
    if (isReconnecting) return

    const nextAddress = address ?? null

    // Don't clear the cookie during the Privy reload gap: the connector's
    // signer is lost on reload, so wagmi reports no address until the bridge
    // reconnects — but a persisted Privy session means we ARE connected.
    // Clearing here makes the SSR `beforeLoad` guard bounce a logged-in user to
    // the landing page. A real logout clears the Privy cookie first.
    if (nextAddress === null && hasStoredPrivySession()) return

    if (nextAddress === previousAddressRef.current) return

    previousAddressRef.current = nextAddress
    void setConnectionCookie(nextAddress)
  }, [address, isReconnecting])

  return null
}
