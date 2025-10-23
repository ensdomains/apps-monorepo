// import { createParaConnector } from '@getpara/wagmi-v2-connector'
// import { injected } from '@wagmi/core'
import { createPublicClient, http } from 'viem'
// import { mainnet, sepolia } from 'viem/chains'
import { sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'
// import { walletConnect } from 'wagmi/connectors'
// import { para, paraMachine } from '@/features/wallet/machines/para'

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

// Commented out Para connector for now - using Privy instead
// const paraConnector = createParaConnector({
//   para,
//   appName: 'demo',
//   options: {},
//   renderModal: (onClose) => {
//     paraMachine.subscribe(({ value }) => {
//       if (value === 'closed') {
//         onClose()
//       }
//     })

//     return {
//       openModal: () => paraMachine.send({ type: 'OPEN' }),
//     }
//   },
// })

// Note: wagmiConfig will be provided by Privy's WagmiProvider
// This is just for reference and public client creation
export const publicClient = createPublicClient({
  chain: customSepolia,
  transport: http(SEPOLIA_RPC_URL),
})

// Commented out original wagmi config - now handled by Privy
// export const wagmiConfig = createConfig({
//   syncConnectedChain: false,
//   ssr: true,
//   multiInjectedProviderDiscovery: true,
//   chains: [customSepolia, mainnet], // Use custom Sepolia with working RPC
//   transports: {
//     1: http(
//       'https://lb.drpc.org/ogrpc?network=ethereum&dkey=AgBISc2US0WgjMYhz9MRMJZsJaE8hzcR76fgOpXEh2H0',
//     ),
//     11155111: http(SEPOLIA_RPC_URL), // Use DRPC for Sepolia
//   },
//   connectors: [
//     paraConnector as any,
//     injected(),
//     walletConnect({
//       projectId: '21fef48091f12692cad574a6f7753643',
//       name: 'WalletConnect',
//     }),
//   ],
// })

// Temporary wagmiConfig export for compatibility - will be replaced by Privy
export const wagmiConfig = createConfig({
  chains: [customSepolia],
  connectors: [],
  transports: {
    [customSepolia.id]: http(SEPOLIA_RPC_URL),
  },
})

// Commented out type exports since wagmiConfig is not available
export type ClientType = ReturnType<typeof createConfig>['getClient']
export type ChainType = ClientType['chain']
