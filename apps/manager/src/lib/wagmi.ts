import { addEnsContracts } from '@ensdomains/ensjs'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { QueryClient } from '@tanstack/react-query'
import { createClient, type HttpTransport, http } from 'viem'
import { mainnet } from 'viem/chains'
import { createConfig } from 'wagmi'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 1, // 1 hour
    },
  },
})

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: false,
  multiInjectedProviderDiscovery: true,
  chains: [addEnsContracts(mainnet)],
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
        'https://lb.drpc.org/ogrpc?network=ethereum&dkey=AgBISc2US0WgjMYhz9MRMJZsJaE8hzcR76fgOpXEh2H0',
      ),
    })
  },
})
