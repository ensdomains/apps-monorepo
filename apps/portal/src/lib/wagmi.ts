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

export const sepoliaWithEns = extendChainWithL1Ens(sepolia)

// later to be replaced with actual namechain sepolia
export const namechainSepolia = extendChainWithL2Ens(sepolia)

export const getChainIdForNetwork = (network: EnsNetworkName): number =>
  network === 'sepolia' ? sepoliaWithEns.id : namechainSepolia.id

const drpc = (chain: Chain) =>
  `https://lb.drpc.live/${chain.name.toLowerCase()}/AnmpasF2C0JBqeAEzxVO8aRo7Ju0xlER8JS4QmlfqV1j`

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
      transport: http(drpc(chain), {
        batch: {
          wait: 10, // Wait 10ms to collect more requests before sending batch (default is 0ms)
        },
      }),
    }),
})
