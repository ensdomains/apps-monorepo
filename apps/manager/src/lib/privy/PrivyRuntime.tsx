import { PrivyProvider } from '@privy-io/react-auth'
import { useEffect } from 'react'
import { publishPrivySession, resetPrivySession } from './privy-session-store'
import { usePrivySessionRuntime } from './usePrivySessionRuntime'
import { usePrivyWagmiBridge } from './usePrivyWagmiBridge'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID ?? ''

/**
 * The Privy runtime — the ONLY module that imports `@privy-io/react-auth`, so
 * the ~1.2 MB SDK lives in this lazily loaded chunk and never enters the
 * initial/SSR bundle. RootProviders mounts it (client-only, via React.lazy)
 * once `requestPrivyLoad()` fires — on load if a stored Privy session exists,
 * or when the user opens the login dialog. See docs/PRIVY.md → "Lazy loading".
 *
 * It calls the real Privy hooks, drives the wagmi bridge, and publishes the
 * session into privy-session-store so the rest of the app can read it via
 * `usePrivySession()` without touching the SDK.
 */
const PrivySessionPublisher = () => {
  const session = usePrivySessionRuntime()

  // Install the Privy provider on our wagmi connector + mirror logout.
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
    // Headless Privy: login() is never called; no smart/global wallets;
    // showWalletUIs:false suppresses vendor confirmation dialogs. Social methods
    // are Google + X only.
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['google', 'twitter'],
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
