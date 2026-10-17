import { WALLETCONNECT_PROJECT_ID } from '@ens-apps/config'
import { createPublicClient, fallback, http, type PublicClient } from 'viem'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import { envConfig, l2Sources } from '@/config'
import { isMockWalletEnabled, mockConnector } from '@/lib/mockWallet.mock'

/**
 * wagmi wiring. The network, chain and RPC endpoints are resolved in
 * `@/config`; this module only turns them into clients.
 */

// Failover across the app's attributed primary and the network's shared
// public endpoints. `rank: false` keeps the declared order (primary first)
// instead of latency ranking, which would let a fast public node steal
// traffic from our key.
const failover = (urls: readonly string[]) =>
  fallback(
    urls.map((url) => http(url, { retryCount: 2 })),
    { rank: false, retryCount: 2 },
  )

export const sepoliaFallbackTransport = failover(envConfig.rpcUrls)

export const sepoliaWithEns = envConfig.chain

export const publicClient = createPublicClient({
  chain: sepoliaWithEns,
  transport: sepoliaFallbackTransport,
  batch: {
    multicall: true,
  },
})

const l2Transports = l2Sources.map(({ chain, rpcUrls }) => ({
  chain,
  transport: failover(rpcUrls),
}))

/** Read clients for the L2 bridge sources, keyed by chain id. */
export const l2PublicClients: ReadonlyMap<number, PublicClient> = new Map(
  l2Transports.map(({ chain, transport }) => [
    chain.id,
    createPublicClient({ chain, transport }),
  ]),
)

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  // The app chain must stay first: it is wagmi's default chain and where a
  // wallet on an unsupported chain is sent at connect. The L2s only exist so a
  // wallet on one can connect as-is and bridge USDC from it.
  chains: [sepoliaWithEns, ...l2Transports.map(({ chain }) => chain)],
  transports: {
    [sepoliaWithEns.id]: sepoliaFallbackTransport,
    ...Object.fromEntries(
      l2Transports.map(({ chain, transport }) => [chain.id, transport]),
    ),
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
