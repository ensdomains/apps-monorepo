import { useEffect, useRef, useState } from 'react'
import { useConnect, useConnections, useConnectors, useDisconnect } from 'wagmi'
import { setActivePrivyProvider } from './privy-connector'
import { usePrivySessionRuntime } from './usePrivySessionRuntime'

// createWallet() throws this for a returning user whose embedded wallet exists
// but useWallets() hasn't surfaced it yet — a benign race, not a failure.
const isExistingWalletError = (e: unknown): boolean =>
  e instanceof Error && /already has an embedded wallet/i.test(e.message)

// Retries for a non-benign createWallet failure (transient blips) before giving
// up and signing out to recover.
const MAX_CREATE_ATTEMPTS = 3

/**
 * Glue between the Privy session and our wagmi connector: when the session has a
 * usable embedded wallet, install its provider on the connector and connect, so
 * `useConnection()` reads the Privy address everywhere; mirror logout the other
 * way. New users have a session but NO wallet yet (headless `createOnLogin`
 * doesn't fire — handoff §4.2), so createWallet() here is the primary path.
 */
export function usePrivyWagmiBridge() {
  const privy = usePrivySessionRuntime()
  const connections = useConnections()
  const connectors = useConnectors()
  const { mutateAsync: connectAsync } = useConnect()
  const { mutateAsync: disconnectAsync } = useDisconnect()
  const privyConnector = connectors.find((c) => c.id === 'privy')
  const lastAttemptedAddress = useRef<string | null>(null)
  // A non-benign createWallet failure must not strand the user on infinite
  // loading (the "creating" latch short-circuits every rerender); retryTick
  // re-runs the effect for a bounded retry.
  const createAttempts = useRef(0)
  const [retryTick, setRetryTick] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryTick isn't read in the effect — it's an intentional trigger to re-run it for a createWallet retry.
  useEffect(() => {
    if (!privyConnector) return
    if (!privy.isConnected) return
    if (privy.busy) return

    // Don't override an explicitly-connected external wallet.
    const externalConnected = connections.some(
      (c) => c.connector.id !== 'privy',
    )
    if (externalConnected) return

    const alreadyConnected = connections.some((c) => c.connector.id === 'privy')

    let cancelled = false
    ;(async () => {
      try {
        // No address yet: NEW user → create the wallet; RETURNING user → wait
        // for useWallets() to surface it (re-creating just throws "already has").
        if (!privy.address) {
          // Already creating, or we know a wallet exists → wait, don't loop.
          if (
            lastAttemptedAddress.current === 'creating' ||
            lastAttemptedAddress.current === 'awaiting-existing-wallet'
          ) {
            return
          }
          // Wallet exists per the user object — skip createWallet, just wait.
          if (privy.hasEmbeddedWallet) {
            lastAttemptedAddress.current = 'awaiting-existing-wallet'
            return
          }
          lastAttemptedAddress.current = 'creating'
          try {
            await privy.createDefaultWallet()
            lastAttemptedAddress.current = null
            createAttempts.current = 0
          } catch (e) {
            if (isExistingWalletError(e)) {
              lastAttemptedAddress.current = 'awaiting-existing-wallet'
            } else {
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
                // Out of retries: sign out so the user falls back to a
                // recoverable logged-out state instead of deadlocking on
                // infinite loading. The session-end effect resets the latch.
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
        // Session + wallet ready. Skip only if we've already bound this exact
        // address AND wagmi is still connected; otherwise (re)install — the
        // module-level binding could be stale after an embedded-wallet switch.
        if (
          lastAttemptedAddress.current === privy.address &&
          alreadyConnected
        ) {
          return
        }
        const binding = await privy.getProvider()
        if (cancelled) return
        setActivePrivyProvider(binding)
        if (alreadyConnected) {
          // Already live — just refresh the bound account from the new binding.
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

  // Reset per-session state when the session ends, so a fresh login starts clean
  // (covers the case where we never connected — e.g. createWallet failed — which
  // the logout-mirror below wouldn't catch).
  useEffect(() => {
    if (privy.ready && !privy.isConnected) {
      lastAttemptedAddress.current = null
      createAttempts.current = 0
    }
  }, [privy.ready, privy.isConnected])

  // Mirror logout: session gone but wagmi still on the privy connector → tear down.
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
