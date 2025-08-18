import { CHAIN_NAMESPACES, type CustomChainConfig } from '@web3auth/modal'
import { type Chain, mainnet } from 'viem/chains'

import { anvil } from '@/lib/wagmi'

export interface ChainConfig extends CustomChainConfig {
  viemChain: Chain
}

export const chains: {
  [key: string]: ChainConfig
} = {
  ethereum: {
    viemChain: mainnet,
    chainNamespace: CHAIN_NAMESPACES.EIP155,
    chainId: '0x1',
    displayName: 'Mainnet',
    rpcTarget: 'https://1rpc.io/eth',
    blockExplorerUrl: 'https://etherscan.io',
    ticker: 'ETH',
    tickerName: 'Ethereum',
    logo: 'https://web3auth.io/images/web3authlog.png',
  },
  namechain: {
    viemChain: anvil,
    chainNamespace: CHAIN_NAMESPACES.EIP155,
    chainId: '0x7a6a', // 31338 in hex
    rpcTarget: 'http://127.0.0.1:8546',
    displayName: 'Local',
    blockExplorerUrl: '',
    ticker: 'ETH',
    tickerName: 'Ethereum',
    logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  },
} as const

export const web3AuthChains: CustomChainConfig[] = [...Object.values(chains)]
