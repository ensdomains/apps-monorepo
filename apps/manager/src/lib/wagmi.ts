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
import { createPublicClient, fallback, http } from 'viem'
import { createConfig } from 'wagmi'

// Re-export shared chain config so existing imports from `@/lib/wagmi` keep
// working. New code should prefer importing from `@ens-apps/indexer/chain`.
export {
  customSepolia,
  SEPOLIA_RPC_URL,
  sepoliaWithEns,
  WALLETCONNECT_PROJECT_ID,
}

/**
 * Ranked fallback transport: drpc first (paid tier, primary), public RPCs
 * behind it. drpc has been observed FLAPPING (intermittent multi-second
 * stalls and timeouts, 2026-07-23) and a single transport turns each stall
 * into a dead UI load or failed submission; `fallback` retries the next
 * provider on error/timeout instead. `rank: false` keeps deterministic
 * ordering (primary stays primary when healthy).
 */
const sepoliaTransport = (batchSize?: number) =>
  fallback(
    [
      http(SEPOLIA_RPC_URL, batchSize ? { batch: { batchSize } } : undefined),
      http('https://ethereum-sepolia-rpc.publicnode.com'),
      http('https://sepolia.gateway.tenderly.co'),
      http('https://1rpc.io/sepolia'),
    ],
    { rank: false, retryCount: 2 },
  )

export const publicClient = createPublicClient({
  chain: sepoliaWithEns,
  transport: sepoliaTransport(),
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
    [sepoliaWithEns.id]: sepoliaTransport(30),
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
