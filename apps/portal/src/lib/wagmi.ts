import { addEnsContracts } from '@ensdomains/ensjs'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createClient, type HttpTransport, http, zeroAddress } from 'viem'
import { mainnet } from 'viem/chains'
import { createConfig } from 'wagmi'

const mainnetWithEns = addEnsContracts(mainnet)

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: false,
  multiInjectedProviderDiscovery: true,
  chains: [
    {
      ...mainnetWithEns,
      contracts: {
        ...mainnetWithEns.contracts,
        ensL2EthRegistrar: { address: zeroAddress },
      },
      subgraphs: {
        ...mainnetWithEns.subgraphs,
        ens: { url: 'https://api.alpha.blue.ensnode.io/subgraph' },
      },
    },
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
  client: ({ chain }) => {
    return createClient<HttpTransport, typeof chain>({
      chain,
      transport: http('https://ethereum-rpc.publicnode.com'),
    })
  },
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
