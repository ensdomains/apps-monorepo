import { addEnsContracts } from '@ensdomains/ensjs'

import {
  createClient,
  createPublicClient,
  createWalletClient,
  type HttpTransport,
  http,
} from 'viem'
import { localhost, mainnet } from 'viem/chains'
import { createConfig } from 'wagmi'
import { metaMaskConnector, paraConnector } from '../walletKit/connectors'

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
  import.meta.env.MODE === 'development' ||
  import.meta.env.VITE_ENABLE_ANVIL === 'true'

export const defaultViemChain = isDevelopment ? anvil : mainnet

const chains = isDevelopment
  ? [addEnsContracts(mainnet), anvil]
  : [addEnsContracts(mainnet)]

export const wagmiConfig = createConfig({
  ssr: false,
  multiInjectedProviderDiscovery: true,
  chains: chains as unknown as readonly [typeof mainnet, ...typeof chains],
  connectors: [paraConnector, metaMaskConnector],
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
  chain: defaultViemChain,
  transport: http(defaultViemChain.rpcUrls.default.http[0]),
})

export const walletClient = createWalletClient({
  chain: defaultViemChain,
  transport: http(defaultViemChain.rpcUrls.default.http[0]),
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
