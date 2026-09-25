import { WALLETCONNECT_PROJECT_ID } from '@ens-apps/config'
import { walletConnect } from '@wagmi/connectors'
import { createClient, fallback, http } from 'viem'
import { createConfig } from 'wagmi'
import { envConfig } from '@/config'
import { getResolvedThemeMode } from '@/hooks/useTheme'
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
export const sepoliaFallbackTransport = fallback(
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

/**
 * The V1 subgraph endpoint, overridable for local work.
 *
 * The override has to happen *after* `envConfig.chain` is built (which calls
 * ensjs's `extendChainWithEns` internally), not by passing a URL further
 * upstream: that function spreads ensjs's own `ensL1Subgraphs` last, so
 * anything supplied earlier is silently discarded.
 *
 * Why it is here at all: every name the e2e suite creates lives on an Anvil fork
 * that diverged from Sepolia minutes ago, so the public subgraph cannot see any
 * of them and never will. Locally that makes the Subnames tab always empty,
 * custom text-record keys undiscoverable and history a confident "no activity"
 * for names with real events — none of which are product bugs.
 * `packages/v1-subgraph-shim` answers the same schema from the fork's own logs.
 *
 * Unset in production, where this is exactly the public endpoint `envConfig`
 * already resolved for the build's network.
 */
export const sepoliaWithEns = {
  ...envConfig.chain,
  subgraphs: {
    ...envConfig.chain.subgraphs,
    ens: {
      ...envConfig.chain.subgraphs.ens,
      // Cast because ensjs types this as the string LITERAL it hardcoded, so
      // any other value is a type error by construction. The literal is an
      // artefact of the value being hardcoded, not a real constraint — the
      // field is a URL, and the whole point here is that it is configurable.
      url: (import.meta.env?.VITE_V1_SUBGRAPH_URL ||
        envConfig.chain.subgraphs.ens
          .url) as typeof envConfig.chain.subgraphs.ens.url,
    },
  },
}

// Injected wallets (MetaMask, Coinbase extension, Rabby, …) are discovered via
// EIP-6963, so WalletConnect is the only explicit connector. We skip the
// Coinbase SDK connector: its Smart Wallet is mainnet-only and breaks on Sepolia.
export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: false,
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns],
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
      transport: sepoliaFallbackTransport,
    }),
})
