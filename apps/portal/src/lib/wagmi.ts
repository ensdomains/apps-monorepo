import { extendChainWithEns } from '@ensdomains/ensjs/chain'
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
