import { addEnsContracts } from '@ensdomains/ensjs'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import {
  createClient,
  createPublicClient,
  type HttpTransport,
  http,
} from 'viem'
import { localhost, mainnet } from 'viem/chains'
import { createConfig } from 'wagmi'

const ANVIL_RPC_URL = 'http://127.0.0.1:8546'

export const anvil = {
  ...localhost,
  id: 31338,
  name: 'Anvil',
  rpcUrls: {
    default: {
      http: [ANVIL_RPC_URL],
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
          ? ANVIL_RPC_URL
          : 'https://lb.drpc.org/ogrpc?network=ethereum&dkey=AgBISc2US0WgjMYhz9MRMJZsJaE8hzcR76fgOpXEh2H0',
      ),
    })
  },
})

export const publicClient = createPublicClient({
  chain: anvil,
  transport: http(ANVIL_RPC_URL),
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
