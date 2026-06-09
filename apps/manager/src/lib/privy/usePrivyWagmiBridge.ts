import { useEffect, useRef } from 'react'
import { useConnect, useConnections, useConnectors, useDisconnect } from 'wagmi'
import { setActivePrivySigner } from './privy-connector'
import { usePrivySession } from './usePrivySession'

/**
 * Glue between the Privy session and our custom wagmi connector.
 *
 * When the Privy session produces a usable signer (the embedded wallet is
 * materialised), we install it on the connector and trigger
 * `wagmi.connect({ connector: privy })`. From that moment `useConnection()`
 * everywhere reads the Privy address — the rest of the app no longer needs
 * `usePrivy()` for "what is the current address."
 *
 * When Privy logs out, we mirror it: clear the connector's signer and
 * `disconnectAsync`.
 *
 * Two states handled:
 *   a) Session + embedded wallet present → install signer, connect.
 *   b) Session but NO embedded wallet. In headless mode this is the NORMAL
 *      state after first login (Privy's `createOnLogin` doesn't fire for
 *      whitelabel flows), so the auto-create below is the PRIMARY path for new
 *      users, not belt-and-braces (handoff §4.2).
 */
export function usePrivyWagmiBridge() {
  const privy = usePrivySession()
  const connections = useConnections()
  const connectors = useConnectors()
  const { mutateAsync: connectAsync } = useConnect()
  const { mutateAsync: disconnectAsync } = useDisconnect()
  const privyConnector = connectors.find((c) => c.id === 'privy')
  const lastAttemptedAddress = useRef<string | null>(null)

  // Bind: when the Privy session is live, install the signer on the connector
  // and wagmi-connect to it. At most one connect attempt per address change.
  useEffect(() => {
    if (!privyConnector) return
    if (!privy.isConnected) return
    if (privy.busy) return

    const alreadyConnected = connections.some((c) => c.connector.id === 'privy')

    let cancelled = false
    ;(async () => {
      try {
        // (b) — session live but no embedded wallet. Expected for new users in
        // headless mode; create it now. One attempt; on failure the error is
        // logged and the latch prevents a loop.
        if (!privy.address) {
          if (lastAttemptedAddress.current === 'creating') return
          lastAttemptedAddress.current = 'creating'
          try {
            await privy.createDefaultWallet()
            // Success → wallets list updates → effect re-runs with an address.
            lastAttemptedAddress.current = null
          } catch (e) {
            // Leave the "creating" latch set so we don't loop on a persistent
            // failure (e.g. embedded wallets disabled in the dashboard).
            console.error('[privy-wagmi] createWallet failed:', e)
          }
          return
        }
        // (a) — session + embedded wallet ready.
        if (alreadyConnected) {
          lastAttemptedAddress.current = privy.address
          return
        }
        if (lastAttemptedAddress.current === privy.address) return
        const signer = await privy.getSigner()
        if (cancelled) return
        setActivePrivySigner(signer)
        await connectAsync({ connector: privyConnector })
        lastAttemptedAddress.current = privy.address
      } catch (err) {
        console.error('[privy-wagmi] bridge step failed:', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [privy, connections, connectAsync, privyConnector])

  // Mirror logout. When the Privy session goes away but wagmi still has the
  // privy connector live, tear that down too.
  useEffect(() => {
    const privyConn = connections.find((c) => c.connector.id === 'privy')
    if (!privyConn) return
    if (privy.isConnected) return
    if (!privy.ready) return // don't tear down during SDK boot

    setActivePrivySigner(null)
    lastAttemptedAddress.current = null
    void disconnectAsync({ connector: privyConn.connector })
  }, [connections, disconnectAsync, privy.isConnected, privy.ready])
}
