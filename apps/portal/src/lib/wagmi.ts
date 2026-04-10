import {
  extendChainWithL1Ens,
  extendChainWithL2Ens,
} from '@ensdomains/ensjs/chain'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { type Chain, createClient, http } from 'viem'
import {
  arbitrumSepolia,
  baseSepolia,
  lineaSepolia,
  optimismSepolia,
  scrollSepolia,
  sepolia,
} from 'viem/chains'
import { createConfig } from 'wagmi'
import type { EnsNetworkName } from '@/utils/types'

// Single source of truth for Sepolia RPC URL.
// Set VITE_SEPOLIA_RPC_URL to point the app at a local Anvil fork (e.g. http://127.0.0.1:8545).
const DEFAULT_SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aRo7Ju0xlER8JS4QmlfqV1j'

export const SEPOLIA_RPC_URL: string =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_SEPOLIA_RPC_URL) ||
  DEFAULT_SEPOLIA_RPC_URL

export const sepoliaWithEns = extendChainWithL1Ens(sepolia)

// later to be replaced with actual namechain sepolia
export const namechainSepolia = extendChainWithL2Ens(sepolia)

export const getChainIdForNetwork = (network: EnsNetworkName): number =>
  network === 'sepolia' ? sepoliaWithEns.id : namechainSepolia.id

const DRPC_CHAIN_SLUGS: Record<number, string> = {
  11155111: 'sepolia',
  11155420: 'optimism-sepolia',
  421614: 'arbitrum-sepolia',
  84532: 'base-sepolia',
  59141: 'linea-sepolia',
  534351: 'scroll-sepolia',
}

const getRpcUrl = (chain: Chain): string => {
  // For Sepolia (and namechain-sepolia which shares the chain ID),
  // prefer the override RPC URL so the app can target a local Anvil fork.
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
  chains: [
    sepoliaWithEns,
    optimismSepolia,
    arbitrumSepolia,
    baseSepolia,
    lineaSepolia,
    scrollSepolia,
    namechainSepolia,
  ],
  connectors: connectorsForWallets(
    [
      {
        groupName: 'Popular',
        wallets: [injectedWallet, metaMaskWallet, frameWallet],
      },
    ],
    { projectId: 'YOUR_PROJECT_ID', appName: 'demo' },
  ),
  client: ({ chain }) =>
    createClient({
      chain,
      transport: http(getRpcUrl(chain), {
        batch: {
          wait: 10, // Wait 10ms to collect more requests before sending batch (default is 0ms)
        },
      }),
    }),
})
