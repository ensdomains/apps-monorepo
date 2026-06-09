import {
  useCreateWallet,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth'
import { useCallback, useMemo, useState } from 'react'
import type { Address, EIP1193Provider } from 'viem'
import type { PrivySessionValue } from './privy-session-store'

/**
 * Thin wrapper around Privy's headless hooks. Social login only — Google and
 * X (Twitter); no email, no other methods (product scope). Privy's hosted
 * modal is never opened (`login()` is never called); every flow runs through
 * these headless hooks against our own UI.
 *
 * This is the ONLY app module that calls the `@privy-io/react-auth` hooks, and
 * it is imported ONLY by PrivyRuntime (the lazily loaded chunk). The rest of
 * the app reads the published value via `usePrivySession()` (the store reader),
 * so the ~1.2 MB SDK never enters the initial/SSR bundle. See docs/PRIVY.md.
 *
 * Nothing here touches wagmi. Privy produces a provider and stops there; the
 * bridge (usePrivyWagmiBridge) installs that provider on our wagmi connector.
 */
export function usePrivySessionRuntime(): PrivySessionValue {
  const privy = usePrivy()
  const { wallets } = useWallets()
  const { createWallet } = useCreateWallet()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { initOAuth } = useLoginWithOAuth({
    onError: (err) => setError(String(err)),
  })

  // Email OTP context lives here so the dialog can hand the code back via the
  // store without threading it through its own state. null = no code in flight.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const { sendCode, loginWithCode } = useLoginWithEmail({
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
   * Email OTP step 1: Privy sends a 6-digit code to the address. Unlike OAuth
   * this is inline (no redirect) — `completeEmail(code)` finishes it. Signup vs
   * login is decided server-side when the code verifies.
   */
  const signInWithEmail = useCallback(
    async (email: string) => {
      setBusy(true)
      setError(null)
      try {
        await sendCode({ email })
        setPendingEmail(email)
      } catch (e) {
        setError(formatError(e))
        throw e
      } finally {
        setBusy(false)
      }
    },
    [sendCode],
  )

  /**
   * Email OTP step 2: verify the code. On a new email this creates the Privy
   * user and (via createOnLogin) the embedded wallet in the same step.
   */
  const completeEmail = useCallback(
    async (code: string) => {
      setBusy(true)
      setError(null)
      try {
        await loginWithCode({ code })
        setPendingEmail(null)
      } catch (e) {
        setError(formatError(e))
        throw e
      } finally {
        setBusy(false)
      }
    },
    [loginWithCode],
  )

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

  // Whether the user ALREADY has an embedded wallet, read from the user object
  // (available immediately on auth) rather than `useWallets()` (which surfaces
  // the address asynchronously after login). The bridge uses this to skip
  // `createWallet()` for returning users — that call would just throw "already
  // has an embedded wallet" and add a round-trip to the reconnect.
  const hasEmbeddedWallet =
    privy.user?.linkedAccounts?.some(
      (account) =>
        account.type === 'wallet' &&
        (account as { walletClientType?: string }).walletClientType === 'privy',
    ) ?? false

  // Connection is "Privy authenticated" — independent of whether the embedded
  // wallet has materialised yet (created asynchronously right after login).
  const isConnected = privy.ready && privy.authenticated

  /**
   * Resolve Privy's embedded-wallet EIP-1193 provider + address. The bridge
   * installs these on our wagmi connector (privy-connector.ts), which hands the
   * provider straight to wagmi — no LocalAccount adapter, full signing fidelity.
   * The provider runs in Privy's origin-isolated iframe; the key shard never
   * leaves it.
   */
  const getProvider = useCallback(async (): Promise<{
    provider: EIP1193Provider
    address: Address
  }> => {
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
    return { provider, address: embeddedWallet.address as Address }
  }, [embeddedWallet, privy.authenticated])

  return useMemo(
    () => ({
      isConnected,
      ready: privy.ready,
      address,
      hasEmbeddedWallet,
      busy,
      error,
      signInWithGoogle,
      signInWithX,
      awaitingEmailCode: pendingEmail,
      signInWithEmail,
      completeEmail,
      createDefaultWallet,
      exportWallet,
      logout,
      getProvider,
    }),
    [
      isConnected,
      privy.ready,
      address,
      hasEmbeddedWallet,
      busy,
      error,
      signInWithGoogle,
      signInWithX,
      pendingEmail,
      signInWithEmail,
      completeEmail,
      createDefaultWallet,
      exportWallet,
      logout,
      getProvider,
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
