import {
  customSepolia,
  SEPOLIA_RPC_URL,
  sepoliaWithEns,
  WALLETCONNECT_PROJECT_ID,
} from '@ens-apps/indexer/chain'
import { createPublicClient, http } from 'viem'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
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
  // Connectors (all surfaced through OUR config — NOT @privy-io/wagmi, Constraint #1):
  //   - privyConnector(): the Privy embedded wallet (Google/X/email social login),
  //     installed by the bridge after a Privy session resolves.
  //   - EIP-6963 discovery (multiInjectedProviderDiscovery) surfaces installed
  //     injected wallets (MetaMask, Frame, Rabby, …) as connectors.
  //   - walletConnect(): QR / mobile-wallet pairing (parity with main #837). It
  //     pulls the WalletConnect/reown deps into the bundle; our LoginDialog
  //     surfaces it as a connect option.
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns],
  transports: {
    [sepoliaWithEns.id]: http(SEPOLIA_RPC_URL, { batch: { batchSize: 30 } }),
  },
  connectors: [
    privyConnector(),
    walletConnect({ projectId: WALLETCONNECT_PROJECT_ID }),
  ],
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
