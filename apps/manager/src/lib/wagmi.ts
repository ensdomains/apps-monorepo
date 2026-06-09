import {
  customSepolia,
  SEPOLIA_RPC_URL,
  sepoliaWithEns,
  WALLETCONNECT_PROJECT_ID,
} from '@ens-apps/indexer/chain'
import { createPublicClient, http } from 'viem'
import { createConfig } from 'wagmi'
import { privyConnector } from './privy/privy-connector'

// Re-export shared chain config so existing imports from `@/lib/wagmi` keep
// working. New code should prefer importing from `@ens-apps/indexer/chain`.
export {
  customSepolia,
  SEPOLIA_RPC_URL,
  sepoliaWithEns,
  WALLETCONNECT_PROJECT_ID,
}

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
  // Social-login only: the sole connector is the Privy embedded wallet, surfaced
  // through our own connector (NOT @privy-io/wagmi — Constraint #1). No injected
  // / external-wallet discovery.
  multiInjectedProviderDiscovery: false,
  chains: [sepoliaWithEns],
  transports: {
    [sepoliaWithEns.id]: http(SEPOLIA_RPC_URL, { batch: { batchSize: 30 } }),
  },
  connectors: [privyConnector()],
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
