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
// for namechain (devnet) we use 31338 and rpc is http://127.0.0.1:8546
const anvil = {
  ...localhost,
  id: 31338,
  name: 'Anvil',
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8546'],
      webSocket: ['ws://127.0.0.1:8546'],
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
    return createClient<HttpTransport, typeof chain>({
      chain,
      transport: http(
        chain.id === 31338
          ? 'http://127.0.0.1:8546' // Use local RPC for Anvil
          : 'https://lb.drpc.org/ogrpc?network=ethereum&dkey=AgBISc2US0WgjMYhz9MRMJZsJaE8hzcR76fgOpXEh2H0',
      ),
    })
  },
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
