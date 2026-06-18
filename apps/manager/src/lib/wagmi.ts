import { WALLETCONNECT_PROJECT_ID } from '@ens-apps/indexer/chain'
import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'

export { WALLETCONNECT_PROJECT_ID }

// Manager owns its Sepolia RPC URL — it must NOT reuse the RPC URL exported by
// `@ens-apps/indexer/chain`, so each app's DRPC key is attributed separately.
// This key is shipped in the browser bundle and is therefore not secret; it
// only scopes quota/usage to the manager app. An optional build-time override
// (`VITE_SEPOLIA_RPC_URL`) takes precedence when provided.
const MANAGER_SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aTDnH6wviUR8JD3QmlfqV1j'

function resolveRpcUrl(): string {
  try {
    const envUrl = import.meta.env?.VITE_SEPOLIA_RPC_URL
    if (!envUrl) return MANAGER_SEPOLIA_RPC_URL
    // Relative paths (like /rpc) only work in the browser. During SSR use the
    // server-specific URL or fall back to the manager default.
    if (envUrl.startsWith('/') && typeof window === 'undefined') {
      return (
        import.meta.env?.VITE_SEPOLIA_RPC_URL_SERVER || MANAGER_SEPOLIA_RPC_URL
      )
    }
    return envUrl
  } catch {
    return MANAGER_SEPOLIA_RPC_URL
  }
}

export const SEPOLIA_RPC_URL: string = resolveRpcUrl()

export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
}

export const sepoliaWithEns = extendChainWithEns(customSepolia)

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
