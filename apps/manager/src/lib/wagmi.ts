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
} from '@rainbow-me/rainbowkit/wallets'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
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

// Base Sepolia (L2) source chain for cross-chain stable payments. Not part of
// the wagmi connection set — used read-only to display the user's L2 stable
// balance in the payment picker. The actual bridge/settlement is handled by
// the Rhinestone orchestrator, not wagmi. RPC overridable via env; defaults to
// the public Base Sepolia endpoint.
export const BASE_SEPOLIA_RPC_URL: string =
  import.meta.env?.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'

export const baseSepoliaPublicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(BASE_SEPOLIA_RPC_URL),
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
        wallets: [injectedWallet, metaMaskWallet, frameWallet],
      },
    ],
    { projectId: WALLETCONNECT_PROJECT_ID, appName: 'ENS Manager' },
  ),
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
