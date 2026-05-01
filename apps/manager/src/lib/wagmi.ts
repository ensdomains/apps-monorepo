import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { injected } from '@wagmi/core'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'

// Single source of truth for Sepolia RPC URL
export const SEPOLIA_RPC_URL =
  'https://virtual.sepolia.us-east.rpc.tenderly.co/881ddb0f-475d-45ac-b93d-e1aca2841811'

// The Tenderly virtual sepolia fork advertises its own chain id, distinct from
// real sepolia (11155111). Using a unique id forces wallets (MetaMask etc.) to
// treat the fork as a custom network and route writes through our RPC instead
// of submitting them to public sepolia.
export const TENDERLY_FORK_CHAIN_ID = 100022568359

// Create a custom Sepolia chain with working RPC
export const customSepolia = {
  ...sepolia,
  name: 'Tenderly Sepolia Fork',
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
}

// V1 ENS subgraph (ensnode) for the Tenderly fork
const V1_SUBGRAPH_URL =
  'https://ensnode-api-sepolia-migration-v1.up.railway.app/subgraph'

// extendChainWithEns refuses any chain id outside its supported list, so we
// extend against the original sepolia id and then override the id afterwards.
const sepoliaWithEnsBase = extendChainWithEns(customSepolia)

export const sepoliaWithEns = {
  ...sepoliaWithEnsBase,
  id: TENDERLY_FORK_CHAIN_ID,
  subgraphs: {
    ...sepoliaWithEnsBase.subgraphs,
    ens: { url: V1_SUBGRAPH_URL },
  },
} as unknown as typeof sepoliaWithEnsBase

export const publicClient = createPublicClient({
  chain: sepoliaWithEns,
  transport: http(SEPOLIA_RPC_URL),
  batch: {
    multicall: true,
  },
})

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns],
  transports: {
    [sepoliaWithEns.id]: http(SEPOLIA_RPC_URL, { batch: { batchSize: 30 } }),
  },
  connectors: [
    injected(),
    walletConnect({
      projectId: '1cb2e088d817de31a39a54154b265f68',
      name: 'WalletConnect',
    }),
  ],
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
