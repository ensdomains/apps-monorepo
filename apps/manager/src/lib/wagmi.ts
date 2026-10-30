import { WALLETCONNECT_PROJECT_ID } from '@ens-apps/config'
import { createPublicClient } from 'viem'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import { envConfig, l2Sources } from '@/config'
import { isMockWalletEnabled, mockConnector } from '@/lib/mockWallet.mock'
import { failover } from '@/lib/rpc'
import { OATH_WALLET } from '@/lib/wallet/oathWallet'

/**
 * wagmi wiring. The network, chain and RPC endpoints are resolved in
 * `@/config`; this module only turns them into clients.
 */

const readBatch = {
  multicall: { batchSize: 8192, wait: 16 },
} as const

export const sepoliaFallbackTransport = failover(envConfig.rpcUrls)

export const sepoliaWithEns = envConfig.chain

export const publicClient = createPublicClient({
  chain: sepoliaWithEns,
  transport: sepoliaFallbackTransport,
  batch: readBatch,
})

export const wagmiConfig = createConfig({
  batch: readBatch,
  syncConnectedChain: false,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  // The app chain must stay first: it is wagmi's default chain and where a
  // wallet on an unsupported chain is sent at connect. The L2s only exist so a
  // wallet on one can connect as-is and bridge USDC from it.
  chains: [sepoliaWithEns, ...l2Sources.map(({ chain }) => chain)],
  transports: {
    [sepoliaWithEns.id]: sepoliaFallbackTransport,
    ...Object.fromEntries(
      l2Sources.map(({ chain, rpcUrls }) => [chain.id, failover(rpcUrls)]),
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
      qrModalOptions: {
        themeMode: 'light',
        // Use Oath's published WalletConnect entry for native app/download
        // links. Other wallets remain available through the standard picker.
        explorerRecommendedWalletIds: [OATH_WALLET.walletConnectId],
      },
    }),
    // Test-only: auto-signing wallet for Playwright/agents. Off in production.
    ...(isMockWalletEnabled ? [mockConnector] : []),
  ],
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
