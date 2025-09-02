import { CHAIN_NAMESPACES, type CustomChainConfig } from '@web3auth/modal'
import type { Chain } from 'viem/chains'

import { anvil } from '@/lib/wagmi'

export interface ChainConfig extends CustomChainConfig {
  viemChain: Chain
}

export const viemNamechainChain = {
  ...anvil,
  id: 31338,
  name: 'Namechain',
}

export const chains: {
  [key: string]: ChainConfig
} = {
  namechain: {
    viemChain: anvil,
    chainNamespace: CHAIN_NAMESPACES.EIP155,
    chainId: '0x7a6a', // 31338 in hex
    rpcTarget: 'http://127.0.0.1:8546',
    displayName: 'Local Development',
    blockExplorerUrl: '',
    ticker: 'ETH',
    tickerName: 'Ethereum',
    logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
    isTestnet: true,
  },
} as const

export const web3AuthChains: CustomChainConfig[] = [...Object.values(chains)]

// Export individual chains for easier access

export const namechainChain = chains.namechain
