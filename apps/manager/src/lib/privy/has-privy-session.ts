/**
 * SSR-safe check for a persisted Privy session, by its localStorage tokens.
 *
 * Distinguishes a genuine disconnect from the brief reload window where wagmi
 * has dropped the Privy connector: the connector's in-memory signer does not
 * survive a page reload, so wagmi reports "disconnected" until the bridge
 * re-derives the signer (async, via the Privy iframe) and reconnects. During
 * that window a Privy session still exists in storage; a real `privy.logout()`
 * clears these tokens.
 *
 * Provider-independent on purpose — callers like `useOnDisconnected` also run
 * when no PrivyProvider is mounted (e.g. e2e with VITE_PRIVY_APP_ID unset),
 * where `usePrivy()` would throw. Coupled to Privy's storage key names; revisit
 * on a Privy major upgrade.
 */
export function hasStoredPrivySession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (
      window.localStorage.getItem('privy-token') !== null ||
      window.localStorage.getItem('privy-refresh-token') !== null
    )
  } catch {
    return false
  }
}
