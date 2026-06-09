import { useEffect, useRef } from 'react'
import { useConnect, useConnections, useConnectors, useDisconnect } from 'wagmi'
import { setActivePrivySigner } from './privy-connector'
import { usePrivySession } from './usePrivySession'

/**
 * `createWallet()` throws this for a returning user whose embedded wallet
 * already exists but hasn't been surfaced by `useWallets()` yet. It's a
 * benign race, not a failure.
 */
const isExistingWalletError = (e: unknown): boolean =>
  e instanceof Error && /already has an embedded wallet/i.test(e.message)

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
        // A Privy (social) session OWNS the connection. If an external connector
        // auto-reconnected (e.g. a previously-used MetaMask via wagmi's
        // reconnectOnMount), it would override the social login — disconnect it
        // so Privy wins. The connect dialog only shows while disconnected, so a
        // user can't deliberately pick an external wallet while a Privy session
        // is live; to use one they sign out of Privy first.
        const externalConn = connections.find((c) => c.connector.id !== 'privy')
        if (externalConn) {
          await disconnectAsync({ connector: externalConn.connector }).catch(
            () => {},
          )
          return // connections change → effect re-runs → connect Privy
        }

        // (b) — session live but no address yet. Two sub-cases:
        //   - NEW user: no embedded wallet → create one (headless flows don't
        //     auto-create; handoff §4.2).
        //   - RETURNING user: a wallet exists but useWallets() hasn't surfaced
        //     its address yet. createWallet() would throw "User already has an
        //     embedded wallet" — that's not a failure, just wait for the address.
        if (!privy.address) {
          // Already creating, or we've learned a wallet exists — wait, don't
          // re-attempt (re-attempting would loop on the "already has" error).
          if (
            lastAttemptedAddress.current === 'creating' ||
            lastAttemptedAddress.current === 'awaiting-existing-wallet'
          ) {
            return
          }
          lastAttemptedAddress.current = 'creating'
          try {
            await privy.createDefaultWallet()
            // Success → wallets list updates → effect re-runs with an address.
            lastAttemptedAddress.current = null
          } catch (e) {
            if (isExistingWalletError(e)) {
              // Returning user: wallet exists, just not surfaced yet. Wait for
              // the address to appear (effect re-runs → path (a) connects).
              lastAttemptedAddress.current = 'awaiting-existing-wallet'
            } else {
              // Genuine failure (e.g. embedded wallets disabled in dashboard).
              // Leave the "creating" latch set so we don't loop.
              console.error('[privy-wagmi] createWallet failed:', e)
            }
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
  }, [privy, connections, connectAsync, disconnectAsync, privyConnector])

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
