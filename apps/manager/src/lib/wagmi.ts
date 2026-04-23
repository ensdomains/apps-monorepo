import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { injected } from '@wagmi/core'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'

// Single source of truth for Sepolia RPC URL.
// In CI the browser uses a Vite proxy (/rpc) while SSR uses the direct URL.
// Set VITE_SEPOLIA_RPC_URL for the client and VITE_SEPOLIA_RPC_URL_SERVER for SSR.
const DEFAULT_SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aTDnH6wviUR8JD3QmlfqV1j'

const resolveRpcUrl = (): string => {
  if (typeof import.meta === 'undefined') return DEFAULT_SEPOLIA_RPC_URL
  const envUrl = import.meta.env?.VITE_SEPOLIA_RPC_URL
  if (!envUrl) return DEFAULT_SEPOLIA_RPC_URL
  // Relative paths (like /rpc) only work in the browser.
  // During SSR use the server-specific URL or fall back to the default.
  if (envUrl.startsWith('/') && typeof window === 'undefined') {
    return (
      import.meta.env?.VITE_SEPOLIA_RPC_URL_SERVER || DEFAULT_SEPOLIA_RPC_URL
    )
  }
  return envUrl
}

export const SEPOLIA_RPC_URL: string = resolveRpcUrl()

// Create a custom Sepolia chain with working RPC
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
    [customSepolia.id]: http(SEPOLIA_RPC_URL, { batch: { batchSize: 30 } }),
  },
  connectors: [
    injected(),
    walletConnect({
      projectId: '1cb2e088d817de31a39a54154b265f68',
      name: 'WalletConnect',
    }),
  ],
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
