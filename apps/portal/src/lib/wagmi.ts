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

const drpc = (chain: Chain) =>
  `https://lb.drpc.live/${chain.name.toLowerCase()}/AnmpasF2C0JBqeAEzxVO8aRo7Ju0xlER8JS4QmlfqV1j`

/** Returns the RPC URL for a chain — uses VITE_SEPOLIA_RPC_URL for Sepolia, drpc for others. */
const rpcUrl = (chain: Chain): string =>
  chain.id === sepolia.id ? SEPOLIA_RPC_URL : drpc(chain)

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
      transport: http(rpcUrl(chain), {
        batch: {
          wait: 10, // Wait 10ms to collect more requests before sending batch (default is 0ms)
        },
      }),
    }),
})
