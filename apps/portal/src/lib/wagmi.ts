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
import { createClient, http } from 'viem'
import { createConfig } from 'wagmi'

// Single source of truth for Sepolia RPC URL.
// Set VITE_SEPOLIA_RPC_URL to point the app at a local Anvil fork (e.g. /rpc via Vite proxy).
const DEFAULT_SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aRo7Ju0xlER8JS4QmlfqV1j'

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

export const sepoliaWithEns = extendChainWithEns(sepolia)

const DRPC_CHAIN_SLUGS: Record<number, string> = {
  11155111: 'sepolia',
  11155420: 'optimism-sepolia',
  421614: 'arbitrum-sepolia',
  84532: 'base-sepolia',
  59141: 'linea-sepolia',
  534351: 'scroll-sepolia',
}

const getRpcUrl = (chain: Chain): string => {
  // For Sepolia, prefer the local override (Anvil fork)
  if (chain.id === sepolia.id && SEPOLIA_RPC_URL !== DEFAULT_SEPOLIA_RPC_URL) {
    return SEPOLIA_RPC_URL
  }
  const drpcKey = import.meta.env.VITE_PUBLIC_DRPC_API_KEY
  if (drpcKey) {
    const slug =
      DRPC_CHAIN_SLUGS[chain.id] ??
      chain.name.toLowerCase().replace(/\s+/g, '-')
    return `https://lb.drpc.live/${slug}/${drpcKey}`
  }
  return chain.rpcUrls.default.http[0]
}

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: false,
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns],
  connectors: connectorsForWallets(
    [
      {
        groupName: 'Popular',
        wallets: [injectedWallet, metaMaskWallet, frameWallet],
      },
    ],
    { projectId: WALLETCONNECT_PROJECT_ID, appName: 'demo' },
  ),
  client: ({ chain }) =>
    createClient({
      chain,
      transport: http(SEPOLIA_RPC_URL, {
        batch: {
          wait: 10, // Wait 10ms to collect more requests before sending batch (default is 0ms)
        },
      }),
    }),
})
