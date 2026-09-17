import {
  orderedSepoliaRpcUrls,
  WALLETCONNECT_PROJECT_ID,
} from '@ens-apps/indexer/chain'
import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { walletConnect } from '@wagmi/connectors'
import { createClient, fallback, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'
import { getResolvedThemeMode } from '@/hooks/useTheme'
import { isMockWalletEnabled, mockConnector } from '@/lib/mockWallet.mock'

export { WALLETCONNECT_PROJECT_ID }

// Portal owns its Sepolia RPC URL — it must NOT reuse the RPC URL exported by
// `@ens-apps/indexer/chain`, so each app's DRPC key is attributed separately.
// This key is shipped in the browser bundle and is therefore not secret; it
// only scopes quota/usage to the portal app. An optional build-time override
// (`VITE_SEPOLIA_RPC_URL`) takes precedence when provided.
//
// This config is browser-only (`wagmiConfig` is `ssr: false`); the SSR/OG
// worker does not use it and reads its own Cloudflare secret instead (see
// `worker/clients.ts`), so no server-side RPC resolution is needed here.
const PORTAL_SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aRo7Ju0xlER8JS4QmlfqV1j'

export const SEPOLIA_RPC_URL: string =
  import.meta.env?.VITE_SEPOLIA_RPC_URL || PORTAL_SEPOLIA_RPC_URL

// Failover to the shared public endpoints (see SEPOLIA_FALLBACK_RPC_URLS in
// @ens-apps/indexer/chain for the rationale and provider choice). The portal's
// own RPC URL stays the preferred (primary) endpoint so quota/usage is still
// attributed to the portal app.
const SEPOLIA_RPC_URLS = orderedSepoliaRpcUrls(SEPOLIA_RPC_URL)

export const sepoliaFallbackTransport = fallback(
  SEPOLIA_RPC_URLS.map((url) =>
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

export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [...SEPOLIA_RPC_URLS] },
    public: { http: [...SEPOLIA_RPC_URLS] },
  },
}

/**
 * The V1 subgraph endpoint, overridable for local work.
 *
 * The override has to happen *after* `extendChainWithEns`, not by passing a URL
 * into it: that function spreads ensjs's own `ensL1Subgraphs` last, so anything
 * supplied by the caller is silently discarded.
 *
 * Why it is here at all: every name the e2e suite creates lives on an Anvil fork
 * that diverged from Sepolia minutes ago, so the public subgraph cannot see any
 * of them and never will. Locally that makes the Subnames tab always empty,
 * custom text-record keys undiscoverable and history a confident "no activity"
 * for names with real events — none of which are product bugs.
 * `packages/v1-subgraph-shim` answers the same schema from the fork's own logs.
 *
 * Unset in production, where this is exactly the public endpoint it always was.
 */
const baseSepoliaWithEns = extendChainWithEns(customSepolia)

export const sepoliaWithEns = {
  ...baseSepoliaWithEns,
  subgraphs: {
    ...baseSepoliaWithEns.subgraphs,
    ens: {
      ...baseSepoliaWithEns.subgraphs.ens,
      // Cast because ensjs types this as the string LITERAL it hardcoded, so
      // any other value is a type error by construction. The literal is an
      // artefact of the value being hardcoded, not a real constraint — the
      // field is a URL, and the whole point here is that it is configurable.
      url: (import.meta.env?.VITE_V1_SUBGRAPH_URL ||
        baseSepoliaWithEns.subgraphs.ens
          .url) as typeof baseSepoliaWithEns.subgraphs.ens.url,
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
