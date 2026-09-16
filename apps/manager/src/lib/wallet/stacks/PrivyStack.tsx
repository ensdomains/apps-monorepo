import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi'
import {
  sepoliaWithEns,
  WALLETCONNECT_PROJECT_ID,
  wagmiConfig,
} from '@/lib/wagmi'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID
if (!privyAppId) {
  // Privy owns the wallet layer, so a valid app id is required everywhere.
  // Fail fast with a clear message instead of letting Privy init with appId=""
  // and surface a cryptic API error later.
  throw new Error('VITE_PRIVY_APP_ID is not set')
}

// Privy (social/email login + embedded wallet) over @privy-io/wagmi. The
// QueryClientProvider comes from the router's SSR-query integration (router.tsx),
// so it isn't mounted here.
export const PrivyStack = ({ children }: { children: React.ReactNode }) => (
  <PrivyProvider
    appId={privyAppId}
    config={{
      loginMethods: ['google', 'twitter', 'email', 'wallet'],
      embeddedWallets: {
        ethereum: { createOnLogin: 'users-without-wallets' },
        // Suppress Privy's own confirmation prompts for ALL embedded-wallet
        // signing — Rhinestone HCA intents and the SIWE backend-auth signature
        // alike. This is safe because the user-facing consent comes from the
        // app's own UI (the BackendAuth modal shows the SIWE message and the
        // user clicks to sign; HCA intents are gasless and app-initiated), so
        // Privy's extra prompt would be redundant, not a missing confirmation.
        showWalletUIs: false,
      },
      defaultChain: sepoliaWithEns,
      // WalletConnect QR for mobile wallets (must be explicitly enabled).
      walletConnectCloudProjectId: WALLETCONNECT_PROJECT_ID,
      externalWallets: { walletConnect: { enabled: true } },
    }}
  >
    <PrivyWagmiProvider config={wagmiConfig}>{children}</PrivyWagmiProvider>
  </PrivyProvider>
)
