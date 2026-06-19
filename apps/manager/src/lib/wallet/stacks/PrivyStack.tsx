import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi'
import {
  sepoliaWithEns,
  WALLETCONNECT_PROJECT_ID,
  wagmiConfig,
} from '@/lib/wagmi'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID ?? ''

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
        // Sign without Privy's confirmation prompt — the Rhinestone HCA flow
        // signs intents on the user's behalf (still gasless).
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
