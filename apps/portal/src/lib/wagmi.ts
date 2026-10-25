import { WALLETCONNECT_PROJECT_ID } from '@ens-apps/config'
import { walletConnect } from '@wagmi/connectors'
import { match, P } from 'ts-pattern'
import { createClient, fallback, http, webSocket } from 'viem'
import { createConfig } from 'wagmi'
import { envConfig } from '@/config'
import { getResolvedThemeMode } from '@/hooks/useTheme'
import { getCustomRpcUrl, WEBSOCKET_URL } from '@/lib/customRpc'
import { isMockWalletEnabled, mockConnector } from '@/lib/mockWallet.mock'

/**
 * wagmi wiring. The network, chain and RPC endpoints are resolved in
 * `@/config`; this module only turns them into clients.
 *
 * Browser-only (`ssr: false`). The SSR/OG worker reads its own Cloudflare
 * secret and builds a separate client; see `worker/clients.ts`.
 */

export { WALLETCONNECT_PROJECT_ID }

// Failover across the app's attributed primary and the network's shared
// public endpoints.
const defaultTransport = fallback(
  envConfig.rpcUrls.map((url) =>
    http(url, {
      retryCount: 2,
      batch: {
        wait: 10, // Wait 10ms to collect more requests before sending batch (default is 0ms)
      },
    }),
  ),
  // rank: false keeps the declared order (primary first) instead of latency
  // ranking, which would let a fast public node steal traffic from our key.
  { rank: false, retryCount: 2 },
)

// A user-chosen RPC replaces the defaults entirely: no fallback, so requests
// never leak to the default providers.
export const fallbackTransport = match(getCustomRpcUrl())
  .with(null, () => defaultTransport)
  .with(P.string.regex(WEBSOCKET_URL), (url) => webSocket(url))
  .with(P.string, (url) => http(url, { retryCount: 2, batch: { wait: 10 } }))
  .exhaustive()

// The build's network, mainnet or Sepolia, with its ENS contracts.
export const ensChain = envConfig.chain

// Injected wallets (MetaMask, Coinbase extension, Rabby, …) are discovered via
// EIP-6963, so WalletConnect is the only explicit connector. We skip the
// Coinbase SDK connector: its Smart Wallet is mainnet-only and breaks on Sepolia.
export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: false,
  multiInjectedProviderDiscovery: true,
  chains: [ensChain],
  connectors: [
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      // Match the app's light/dark preference on load. The modal theme is fixed
      // at connector creation, so a mid-session toggle won't restyle it.
      qrModalOptions: { themeMode: getResolvedThemeMode() },
    }),
    // Test-only: auto-signing wallet for Playwright/agents. Off in production.
    ...(isMockWalletEnabled ? [mockConnector] : []),
  ],
  client: ({ chain }) =>
    createClient({
      chain,
      transport: fallbackTransport,
    }),
})
