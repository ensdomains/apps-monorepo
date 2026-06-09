import {
  useCreateWallet,
  useLoginWithOAuth,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth'
import { useCallback, useMemo, useState } from 'react'
import type { Address, EIP1193Provider, LocalAccount } from 'viem'
import { privyAccountFromProvider } from './privy-signer'

/**
 * Thin wrapper around Privy's headless hooks. Social login only — Google and
 * X (Twitter); no email, no other methods (product scope). Privy's hosted
 * modal is never opened (`login()` is never called); every flow runs through
 * these headless hooks against our own UI.
 *
 * Nothing here touches wagmi. Privy produces a signer and stops there; the
 * bridge (usePrivyWagmiBridge) installs that signer on our wagmi connector.
 */
export function usePrivySession() {
  const privy = usePrivy()
  const { wallets } = useWallets()
  const { createWallet } = useCreateWallet()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { initOAuth } = useLoginWithOAuth({
    onError: (err) => setError(String(err)),
  })

  /**
   * OAuth login. REDIRECT-based: the page navigates to the provider and back.
   * Privy's SDK consumes the `privy_oauth_code` query param on remount — no
   * popup, no COOP headers. In-flight app state dies at redirect (Privy
   * restores its own auth state on return); anything else we care about must be
   * persisted by us before calling this.
   */
  const signInWithGoogle = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await initOAuth({ provider: 'google' })
      // Unreachable in the redirect flow — the page navigates away.
    } catch (e) {
      setError(formatError(e))
      setBusy(false)
      throw e
    }
  }, [initOAuth])

  const signInWithX = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await initOAuth({ provider: 'twitter' })
    } catch (e) {
      setError(formatError(e))
      setBusy(false)
      throw e
    }
  }, [initOAuth])

  /**
   * Embedded-wallet creation. `createOnLogin` does NOT fire for headless
   * (whitelabel) flows — a documented Privy limitation — so new users land with
   * a session but no wallet. The bridge calls this client-side as the PRIMARY
   * path for new users (handoff §4.2), not a fallback.
   */
  const createDefaultWallet = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await createWallet()
    } catch (e) {
      setError(formatError(e))
      throw e
    } finally {
      setBusy(false)
    }
  }, [createWallet])

  /**
   * Privy's user-facing key export. Opens Privy's export iframe on a separate
   * origin; the private key is assembled and displayed there — neither this app
   * nor Privy's servers see plaintext. This is the "user can permanently leave
   * the vendor" escape hatch and is the one place Privy's own UI is allowed to
   * render in our otherwise-headless app.
   */
  const exportWallet = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await privy.exportWallet()
    } catch (e) {
      setError(formatError(e))
    } finally {
      setBusy(false)
    }
  }, [privy])

  const logout = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await privy.logout()
    } catch (e) {
      setError(formatError(e))
    } finally {
      setBusy(false)
    }
  }, [privy])

  /**
   * The Privy EMBEDDED wallet. `useWallets()` mixes embedded and external
   * wallets; a user who linked MetaMask gets a `walletClientType: "metamask"`
   * entry Privy cannot sign with. Filter on the embedded wallet.
   */
  const embeddedWallet = wallets.find(
    (w) =>
      w.walletClientType === 'privy' ||
      (w as { connectorType?: string }).connectorType === 'embedded',
  )
  const address = (embeddedWallet?.address as Address | undefined) ?? null

  // Connection is "Privy authenticated" — independent of whether the embedded
  // wallet has materialised yet (created asynchronously right after login).
  const isConnected = privy.ready && privy.authenticated

  /**
   * Build a viem LocalAccount that signs through Privy's embedded wallet
   * provider (origin-isolated iframe; the key shard never leaves it).
   */
  const getSigner = useCallback(async (): Promise<LocalAccount> => {
    if (!privy.authenticated) {
      throw new Error('No Privy session. Sign in first.')
    }
    if (!embeddedWallet) {
      throw new Error(
        'Privy user has no embedded wallet yet. Headless flows must create it ' +
          'via createDefaultWallet(); note useWallets() also lists linked ' +
          "EXTERNAL wallets (walletClientType !== 'privy') Privy cannot sign with.",
      )
    }
    const provider =
      (await embeddedWallet.getEthereumProvider()) as EIP1193Provider
    return privyAccountFromProvider(provider, embeddedWallet.address as Address)
  }, [embeddedWallet, privy.authenticated])

  return useMemo(
    () => ({
      isConnected,
      ready: privy.ready,
      address,
      user: privy.user,
      busy,
      error,
      signInWithGoogle,
      signInWithX,
      createDefaultWallet,
      exportWallet,
      logout,
      getSigner,
    }),
    [
      isConnected,
      privy.ready,
      privy.user,
      address,
      busy,
      error,
      signInWithGoogle,
      signInWithX,
      createDefaultWallet,
      exportWallet,
      logout,
      getSigner,
    ],
  )
}

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return 'Unknown error'
  }
}
