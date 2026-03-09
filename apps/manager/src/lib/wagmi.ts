import {
  extendChainWithL1Ens,
  extendChainWithL2Ens,
} from '@ensdomains/ensjs/chain'
import { injected } from '@wagmi/core'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'

// Single source of truth for Sepolia RPC URL.
// Set VITE_SEPOLIA_RPC_URL to point the app at a local Anvil fork (e.g. http://127.0.0.1:8545).
const DEFAULT_SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aTDnH6wviUR8JD3QmlfqV1j'

export const SEPOLIA_RPC_URL: string =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_SEPOLIA_RPC_URL) ||
  DEFAULT_SEPOLIA_RPC_URL

// Create a custom Sepolia chain with working RPC
export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
}

export const sepoliaWithEns = extendChainWithL1Ens(customSepolia)
export const namechainSepolia = extendChainWithL2Ens(sepolia)

const ccipReadConfig = {
  async request({
    data,
    sender,
  }: {
    data: `0x${string}`
    sender: `0x${string}`
  }) {
    const response = await fetch('https://raffy.box/urg/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ data, sender }),
    })
    const json = (await response.json()) as { data?: unknown }
    const result = json?.data

    if (typeof result !== 'string' || !result.startsWith('0x')) {
      throw new Error(
        `Invalid CCIP read response, expected { data: '0x...' }, got: ${JSON.stringify(
          json,
        )}`,
      )
    }

    return result as `0x${string}`
  },
}

export const publicClient = createPublicClient({
  chain: sepoliaWithEns,
  transport: http(SEPOLIA_RPC_URL),
  ccipRead: ccipReadConfig,
})

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns, namechainSepolia],
  transports: {
    [customSepolia.id]: http(SEPOLIA_RPC_URL, { batch: { batchSize: 30 } }),
  },
  ccipRead: ccipReadConfig,
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
