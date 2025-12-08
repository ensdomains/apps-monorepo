import {
  extendChainWithL1Ens,
  extendChainWithL2Ens,
} from '@ensdomains/ensjs/chain'
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
    [customSepolia.id]: http(SEPOLIA_RPC_URL),
  },
  ccipRead: ccipReadConfig,
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
