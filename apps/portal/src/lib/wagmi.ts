import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createClient, http } from 'viem'
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
      transport: http(
        `https://lb.drpc.live/${chain.name.toLowerCase()}/AgBISc2US0WgjMYhz9MRMJbJzb3Frm0R8LnzQrxF2MGT`,
      ),
    }),
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
