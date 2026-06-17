import { QueryClientProvider } from '@tanstack/react-query'
// Resolved at build time by a Vite alias to one vendor stack (RainbowKit by
// default, Privy when VITE_FF_USE_PRIVY is set). Static import → only the
// selected vendor's code is bundled, and the tree renders synchronously.
import ActiveWalletStack from 'active-wallet-stack'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'

// Privy reconnects external wallets itself (ExternalWalletReconnect) to avoid
// racing the bridge, so wagmi's auto-reconnect is disabled in that build.
const reconnectOnMount = import.meta.env.VITE_FF_USE_PRIVY !== 'true'

/**
 * The wallet layer. Owns the wagmi + query context and mounts the build-selected
 * vendor stack, which fills WalletUiContext. Everything inside is vendor-agnostic
 * (connect via useLoginModal, disconnect via useSignOut, connection via wagmi).
 */
export const WalletProvider = ({
  queryClient,
  children,
}: {
  queryClient: React.ComponentProps<typeof QueryClientProvider>['client']
  children: React.ReactNode
}) => (
  <WagmiProvider config={wagmiConfig} reconnectOnMount={reconnectOnMount}>
    <QueryClientProvider client={queryClient}>
      <ActiveWalletStack>{children}</ActiveWalletStack>
    </QueryClientProvider>
  </WagmiProvider>
)
