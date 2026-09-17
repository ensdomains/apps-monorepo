import { WALLETCONNECT_PROJECT_ID } from '@ens-apps/config'
import { createPublicClient, fallback, http } from 'viem'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import { config } from '@/config'
import { isMockWalletEnabled, mockConnector } from '@/lib/mockWallet.mock'

/**
 * wagmi wiring. The network, chain and RPC endpoints are resolved in
 * `@/config`; this module only turns them into clients.
 */

// Failover across the app's attributed primary and the network's shared
// public endpoints. `rank: false` keeps the declared order (primary first)
// instead of latency ranking, which would let a fast public node steal
// traffic from our key.
export const sepoliaFallbackTransport = fallback(
  config.rpcUrls.map((url) => http(url, { retryCount: 2 })),
  { rank: false, retryCount: 2 },
)

export const sepoliaWithEns = config.chain

export const publicClient = createPublicClient({
  chain: sepoliaWithEns,
  transport: sepoliaFallbackTransport,
  batch: {
    multicall: true,
  },
})

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns],
  transports: {
    [sepoliaWithEns.id]: sepoliaFallbackTransport,
  },
  // Injected wallets (MetaMask, Rabby, Frame, …) are discovered via EIP-6963
  // (multiInjectedProviderDiscovery above), so WalletConnect is the only
  // explicit connector — same setup as the portal app.
  connectors: [
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      // The QR modal follows the OS theme by default; the manager app is
      // light-only, so pin it.
      qrModalOptions: { themeMode: 'light' },
    }),
    // Test-only: auto-signing wallet for Playwright/agents. Off in production.
    ...(isMockWalletEnabled ? [mockConnector] : []),
  ],
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
