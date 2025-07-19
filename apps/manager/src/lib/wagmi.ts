import { addEnsContracts } from '@ensdomains/ensjs'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createClient, type HttpTransport, http } from 'viem'
import { localhost, mainnet } from 'viem/chains'
import { createConfig } from 'wagmi'

// Use localhost chain for Anvil with custom configuration
const anvil = {
  ...localhost,
  id: 31337,
  name: 'Anvil',
  rpcUrls: {
    ...localhost.rpcUrls,
    default: {
      http: ['http://127.0.0.1:8545'],
      webSocket: ['ws://127.0.0.1:8545'],
    },
  },
}

const isDevelopment =
  process.env.NODE_ENV === 'development' ||
  process.env.NEXT_PUBLIC_ENABLE_ANVIL === 'true'

export const wagmiConfig = createConfig({
  ssr: false,
  multiInjectedProviderDiscovery: true,
  chains: isDevelopment
    ? [addEnsContracts(mainnet), anvil]
    : [addEnsContracts(mainnet)],
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
    console.log('+++++++++chain', chain)
    return createClient<HttpTransport, typeof chain>({
      chain,
      transport: http(
        chain.id === 31337
          ? 'http://127.0.0.1:8545' // Use local RPC for Anvil
          : 'https://lb.drpc.org/ogrpc?network=ethereum&dkey=AgBISc2US0WgjMYhz9MRMJZsJaE8hzcR76fgOpXEh2H0',
      ),
    })
  },
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
