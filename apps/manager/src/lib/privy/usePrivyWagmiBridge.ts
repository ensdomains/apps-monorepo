import { useEffect, useRef, useState } from 'react'
import { useConnect, useConnections, useConnectors, useDisconnect } from 'wagmi'
import { setActivePrivyProvider } from './privy-connector'
import { usePrivySessionRuntime } from './usePrivySessionRuntime'

/**
 * `createWallet()` throws this for a returning user whose embedded wallet
 * already exists but hasn't been surfaced by `useWallets()` yet. It's a
 * benign race, not a failure.
 */
const isExistingWalletError = (e: unknown): boolean =>
  e instanceof Error && /already has an embedded wallet/i.test(e.message)

// How many times to retry a non-benign createWallet failure (covers transient
// network blips) before giving up and signing out to recover.
const MAX_CREATE_ATTEMPTS = 3

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
  const privy = usePrivySessionRuntime()
  const connections = useConnections()
  const connectors = useConnectors()
  const { mutateAsync: connectAsync } = useConnect()
  const { mutateAsync: disconnectAsync } = useDisconnect()
  const privyConnector = connectors.find((c) => c.id === 'privy')
  const lastAttemptedAddress = useRef<string | null>(null)
  // createWallet retry budget. A non-benign failure must not strand the user on
  // an infinite loading state (the "creating" latch would otherwise short-
  // circuit every rerender). retryTick re-runs the bind effect for a retry.
  const createAttempts = useRef(0)
  const [retryTick, setRetryTick] = useState(0)

  // Bind: when the Privy session is live, install the signer on the connector
  // and wagmi-connect to it. At most one connect attempt per address change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryTick isn't read in the effect — it's an intentional trigger to re-run it for a createWallet retry.
  useEffect(() => {
    if (!privyConnector) return
    if (!privy.isConnected) return
    if (privy.busy) return

    // Respect an explicitly-connected external wallet (MetaMask / WalletConnect):
    // if one is active, don't override it with the Privy connector.
    const externalConnected = connections.some(
      (c) => c.connector.id !== 'privy',
    )
    if (externalConnected) return

    const alreadyConnected = connections.some((c) => c.connector.id === 'privy')

    let cancelled = false
    ;(async () => {
      try {
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
          // Returning user: the wallet already exists (per the user object) but
          // useWallets() hasn't surfaced its address yet. Skip createWallet()
          // entirely — it would only throw "already has an embedded wallet" and
          // slow the reconnect — and just wait for the address to appear.
          if (privy.hasEmbeddedWallet) {
            lastAttemptedAddress.current = 'awaiting-existing-wallet'
            return
          }
          lastAttemptedAddress.current = 'creating'
          try {
            await privy.createDefaultWallet()
            // Success → wallets list updates → effect re-runs with an address.
            lastAttemptedAddress.current = null
            createAttempts.current = 0
          } catch (e) {
            if (isExistingWalletError(e)) {
              // Returning user: wallet exists, just not surfaced yet. Wait for
              // the address to appear (effect re-runs → path (a) connects).
              lastAttemptedAddress.current = 'awaiting-existing-wallet'
            } else {
              // Genuine failure (embedded wallets disabled, transient network…).
              createAttempts.current += 1
              if (createAttempts.current < MAX_CREATE_ATTEMPTS) {
                // Likely transient — clear the latch and re-run to retry.
                console.warn(
                  `[privy-wagmi] createWallet failed (attempt ${createAttempts.current}); retrying`,
                  e,
                )
                lastAttemptedAddress.current = null
                setRetryTick((t) => t + 1)
              } else {
                // Out of retries: don't deadlock on infinite loading. Sign out
                // so the user falls back to a recoverable logged-out state (the
                // dashboard guard then redirects to '/') and can retry. The
                // session-end effect resets the latch + counter.
                console.error(
                  '[privy-wagmi] createWallet failed after retries; signing out',
                  e,
                )
                await privy.logout()
              }
            }
          }
          return
        }
        // (a) — session + embedded wallet ready.
        // Nothing to do only when we've ALREADY bound this exact address AND
        // wagmi is still connected to it. If the address changed (Privy
        // restored/switched to a different embedded wallet) or the connection
        // dropped, fall through and (re)install the signer below.
        if (
          lastAttemptedAddress.current === privy.address &&
          alreadyConnected
        ) {
          return
        }
        // Resolve and install the provider for the CURRENT Privy address. This
        // runs even when wagmi already has the privy connector: otherwise the
        // module-level binding in privy-connector.ts could be left stale after
        // an embedded-wallet switch, and later signing would use the wrong key.
        const binding = await privy.getProvider()
        if (cancelled) return
        setActivePrivyProvider(binding)
        if (alreadyConnected) {
          // Connector already live — just refresh the bound account so wagmi
          // re-reads the new address from the now-updated binding.
          privyConnector.onAccountsChanged?.([privy.address])
        } else {
          await connectAsync({ connector: privyConnector })
        }
        lastAttemptedAddress.current = privy.address
      } catch (err) {
        console.error('[privy-wagmi] bridge step failed:', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [privy, connections, connectAsync, privyConnector, retryTick])

  // Reset per-session bridge state when the Privy session ends, so a fresh
  // login starts clean. The logout-mirror effect below only resets when wagmi
  // was actually connected to the privy connector; this also covers the case
  // where we never connected (e.g. createWallet failed before connecting), so
  // the "creating" latch doesn't persist into the next login attempt.
  useEffect(() => {
    if (privy.ready && !privy.isConnected) {
      lastAttemptedAddress.current = null
      createAttempts.current = 0
    }
  }, [privy.ready, privy.isConnected])

  // Mirror logout. When the Privy session goes away but wagmi still has the
  // privy connector live, tear that down too.
  useEffect(() => {
    const privyConn = connections.find((c) => c.connector.id === 'privy')
    if (!privyConn) return
    if (privy.isConnected) return
    if (!privy.ready) return // don't tear down during SDK boot

    setActivePrivyProvider(null)
    lastAttemptedAddress.current = null
    void disconnectAsync({ connector: privyConn.connector })
  }, [connections, disconnectAsync, privy.isConnected, privy.ready])
}
