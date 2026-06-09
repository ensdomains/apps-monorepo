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
 * Thin wrapper around Privy's headless hooks (Google, X, email OTP) — Privy's
 * hosted modal is never opened; flows run against our own UI.
 *
 * This is the ONLY module calling the `@privy-io/react-auth` hooks, imported
 * ONLY by PrivyRuntime (the lazy chunk); the rest of the app reads the published
 * value via usePrivySession(), keeping the SDK off the initial/SSR bundle.
 * Nothing here touches wagmi — the bridge installs the provider on the connector.
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

  // Email OTP context (null = no code in flight) so the dialog reads it via the
  // store rather than its own state.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const { sendCode, loginWithCode } = useLoginWithEmail({
    onError: (err) => setError(String(err)),
  })

  // OAuth is REDIRECT-based: the page navigates away and back (Privy consumes
  // `privy_oauth_code` on return). In-flight app state dies at the redirect.
  const signInWithGoogle = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await initOAuth({ provider: 'google' })
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

  // Email OTP step 1 (inline, no redirect): send the code; completeEmail() verifies.
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

  // Headless `createOnLogin` doesn't fire (Privy limitation), so new users land
  // with a session but no wallet — the bridge calls this as the primary path.
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

  // Privy's key-export iframe (separate origin; plaintext never touches us) —
  // the "leave the vendor" escape hatch, the one place Privy's UI renders.
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

  // useWallets() mixes embedded + external; pick the embedded one (Privy can't
  // sign with a linked external wallet).
  const embeddedWallet = wallets.find(
    (w) =>
      w.walletClientType === 'privy' ||
      (w as { connectorType?: string }).connectorType === 'embedded',
  )
  const address = (embeddedWallet?.address as Address | undefined) ?? null

  // Read from the user object (available immediately, unlike useWallets()) so the
  // bridge can skip createWallet() for returning users.
  const hasEmbeddedWallet =
    privy.user?.linkedAccounts?.some(
      (account) =>
        account.type === 'wallet' &&
        (account as { walletClientType?: string }).walletClientType === 'privy',
    ) ?? false

  // Authenticated, regardless of whether the wallet address has surfaced yet.
  const isConnected = privy.ready && privy.authenticated

  // The embedded wallet's EIP-1193 provider + address; the connector hands it to
  // wagmi unchanged (full signing fidelity, key shard stays in Privy's iframe).
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
