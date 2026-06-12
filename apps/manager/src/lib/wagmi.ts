import {
  customSepolia,
  SEPOLIA_RPC_URL,
  sepoliaWithEns,
  WALLETCONNECT_PROJECT_ID,
} from '@ens-apps/indexer/chain'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createPublicClient, http } from 'viem'
import { createConfig } from 'wagmi'

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
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns],
  transports: {
    [sepoliaWithEns.id]: http(SEPOLIA_RPC_URL, { batch: { batchSize: 30 } }),
  },
  connectors: connectorsForWallets(
    [
      {
        groupName: 'Popular',
        wallets: [
          injectedWallet,
          metaMaskWallet,
          walletConnectWallet,
          frameWallet,
        ],
      },
    ],
    { projectId: WALLETCONNECT_PROJECT_ID, appName: 'ENS Manager' },
  ),
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
