import { addEnsContracts } from '@ensdomains/ensjs'
import { injected } from '@wagmi/core'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'

// Single source of truth for Sepolia RPC URL
export const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

// Create a custom Sepolia chain with working RPC
export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: {
      http: [SEPOLIA_RPC_URL],
    },
    public: {
      http: [SEPOLIA_RPC_URL],
    },
  },
}

export const publicClient = createPublicClient({
  chain: customSepolia,
  transport: http(SEPOLIA_RPC_URL),
})

export const sepoliaWithEns = addEnsContracts(customSepolia)
// TODO: Not sure if this is needed separately from the publicClient
export const ensPublicClient = createPublicClient({
  chain: sepoliaWithEns,
  transport: http(SEPOLIA_RPC_URL),
})

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  chains: [customSepolia],
  transports: {
    [customSepolia.id]: http(SEPOLIA_RPC_URL),
  },
  connectors: [
    injected(),
    walletConnect({
      projectId: '21fef48091f12692cad574a6f7753643',
      name: 'WalletConnect',
    }),
  ],
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
