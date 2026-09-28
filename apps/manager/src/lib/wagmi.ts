import { WALLETCONNECT_PROJECT_ID } from '@ens-apps/config'
import { createPublicClient, fallback, http } from 'viem'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import { envConfig } from '@/config'
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
  envConfig.rpcUrls.map((url) => http(url, { retryCount: 2 })),
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
