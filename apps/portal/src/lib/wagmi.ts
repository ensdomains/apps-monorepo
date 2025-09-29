import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createClient, type HttpTransport, http } from 'viem'
import { mainnet } from 'viem/chains'
import { createConfig } from 'wagmi'

export const mainnetWithEns = extendChainWithEns(mainnet)

export const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [injectedWallet, metaMaskWallet, frameWallet],
    },
  ],
  { projectId: 'YOUR_PROJECT_ID', appName: 'demo' },
)

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: false,
  multiInjectedProviderDiscovery: true,
  chains: [
    {
      ...mainnetWithEns,
      subgraphs: {
        ...mainnetWithEns.subgraphs,
        ens: { url: 'https://api.alpha.blue.ensnode.io/subgraph' },
      },
    },
  ],
  connectors,
  client: ({ chain }) => {
    return createClient<HttpTransport, typeof chain>({
      chain,
      transport: http(),
    })
  },
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
