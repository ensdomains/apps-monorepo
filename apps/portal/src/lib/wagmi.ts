import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'

// Tenderly virtual fork RPC — kept in sync with apps/manager/src/lib/wagmi.ts
const SEPOLIA_RPC_URL =
  'https://virtual.sepolia.us-east.rpc.tenderly.co/881ddb0f-475d-45ac-b93d-e1aca2841811'

// V1 ENS subgraph (ensnode) for the Tenderly fork
const V1_SUBGRAPH_URL =
  'https://ensnode-api-sepolia-migration-v1.up.railway.app/subgraph'

const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
}

const sepoliaWithEnsBase = extendChainWithEns(customSepolia)

export const sepoliaWithEns = {
  ...sepoliaWithEnsBase,
  subgraphs: {
    ...sepoliaWithEnsBase.subgraphs,
    ens: { url: V1_SUBGRAPH_URL },
  },
} as unknown as typeof sepoliaWithEnsBase

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: false,
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns],
  connectors: connectorsForWallets(
    [
      {
        groupName: 'Popular',
        wallets: [injectedWallet, metaMaskWallet, frameWallet],
      },
    ],
    { projectId: 'YOUR_PROJECT_ID', appName: 'demo' },
  ),
  client: ({ chain }) =>
    createClient({
      chain,
      transport: http(SEPOLIA_RPC_URL, {
        batch: {
          wait: 10, // Wait 10ms to collect more requests before sending batch (default is 0ms)
        },
      }),
    }),
})
