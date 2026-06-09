import {
  customSepolia,
  SEPOLIA_RPC_URL,
  sepoliaWithEns,
} from '@ens-apps/indexer/chain'
import { createPublicClient, http } from 'viem'
import { createConfig } from 'wagmi'
import { privyConnector } from './privy/privy-connector'

// Re-export shared chain config so existing imports from `@/lib/wagmi` keep
// working. New code should prefer importing from `@ens-apps/indexer/chain`.
export { customSepolia, SEPOLIA_RPC_URL, sepoliaWithEns }

export const publicClient = createPublicClient({
  chain: sepoliaWithEns,
  transport: http(SEPOLIA_RPC_URL),
  batch: {
    multicall: true,
  },
})

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: true,
  // Connectors (all surfaced through OUR config — NOT @privy-io/wagmi, Constraint #1):
  //   - privyConnector(): the Privy embedded wallet (Google/X social login),
  //     installed by the bridge after a Privy session resolves.
  //   - EIP-6963 discovery (multiInjectedProviderDiscovery) surfaces installed
  //     injected wallets (MetaMask, Frame, Rabby, …) as connectors.
  // NOTE: walletConnect() was removed — it dragged in the reown/WalletConnect
  // modal UI (~hundreds of KiB gzip) we don't use (we render our own dialog).
  // QR / mobile-wallet pairing can be reintroduced lazily if needed.
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns],
  transports: {
    [sepoliaWithEns.id]: http(SEPOLIA_RPC_URL, { batch: { batchSize: 30 } }),
  },
  connectors: [privyConnector()],
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
