import { useEffect } from 'react'
import { useConnection } from 'wagmi'
import { hasStoredPrivySession } from '@/lib/privy/has-privy-session'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'

/**
 * useOnDisconnected
 *
 * Calls `onDisconnect` once the wallet is genuinely, finally disconnected.
 *
 * The disconnect *signal* is wagmi's connection status — the immediate source
 * of truth — NOT the smart-account machine's derived `isConnected`, which lags
 * during the reconnect window (wagmi reconnected, machine not yet synced).
 * Reading that gap as a disconnect fired a spurious `navigate()` mid-reload
 * that raced TanStack Router and blanked the page (`Outlet` throwing
 * `undefined`).
 *
 * It is gated on the connection having settled — wagmi not (re)connecting and
 * the smart-account provider having finished its initial restoration
 * (`hasInitialized`) — AND on there being no persisted Privy session. The
 * latter matters because the Privy connector's signer is lost on reload, so
 * wagmi reports `disconnected` for a moment while Privy restores the session
 * and the bridge reconnects; bouncing then would wrongly kick a logged-in user
 * to the landing page. A real logout clears the Privy tokens, so this still
 * fires on genuine disconnects.
 *
 * @param onDisconnect Callback to call when the wallet is disconnected.
 */
export const useOnDisconnected = (onDisconnect: () => void) => {
  const { status, isConnecting, isReconnecting } = useConnection()
  const { hasInitialized } = useSmartAccountContext()

  useEffect(() => {
    if (isConnecting || isReconnecting || !hasInitialized) return
    // A persisted Privy session means the bridge will (re)connect wagmi shortly
    // — don't treat the reload reconnect gap as a disconnect.
    if (hasStoredPrivySession()) return
    if (status === 'disconnected') {
      onDisconnect()
    }
  }, [status, isConnecting, isReconnecting, hasInitialized, onDisconnect])
}
