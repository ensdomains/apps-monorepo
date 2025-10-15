import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createClient, type HttpTransport, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: false,
  multiInjectedProviderDiscovery: true,
  chains: [extendChainWithEns(sepolia)],
  connectors: connectorsForWallets(
    [
      {
        groupName: 'Popular',
        wallets: [injectedWallet, metaMaskWallet, frameWallet],
      },
    ],
    { projectId: 'YOUR_PROJECT_ID', appName: 'demo' },
  ),
  client: ({ chain }) => {
    return createClient<HttpTransport, typeof chain>({
      chain,
      transport: http('https://sepolia.drpc.org'),
    })
  },
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
