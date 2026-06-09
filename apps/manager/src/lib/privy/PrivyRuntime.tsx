import { PrivyProvider } from '@privy-io/react-auth'
import { useEffect } from 'react'
import { publishPrivySession, resetPrivySession } from './privy-session-store'
import { usePrivySessionRuntime } from './usePrivySessionRuntime'
import { usePrivyWagmiBridge } from './usePrivyWagmiBridge'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID ?? ''

/**
 * The Privy runtime — the ONLY module importing `@privy-io/react-auth`, so the
 * SDK stays in this lazy chunk (see docs/PRIVY.md). Calls the real hooks, drives
 * the wagmi bridge, and publishes the session into privy-session-store for the
 * rest of the app to read via usePrivySession().
 */
const PrivySessionPublisher = () => {
  const session = usePrivySessionRuntime()

  usePrivyWagmiBridge()

  useEffect(() => {
    publishPrivySession(session)
  }, [session])

  // On unmount, fall back to logged-out defaults.
  useEffect(() => () => resetPrivySession(), [])

  return null
}

export default function PrivyRuntime() {
  return (
    // Headless: login() is never called; no smart/global wallets;
    // showWalletUIs:false hides vendor dialogs. Methods: Google, X, email.
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['google', 'twitter', 'email'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
          showWalletUIs: false,
        },
        appearance: { walletList: [] },
      }}
    >
      <PrivySessionPublisher />
    </PrivyProvider>
  )
}
