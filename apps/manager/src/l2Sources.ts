import type { EnsNetwork } from '@ens-apps/config'
import type { Address, Chain } from 'viem'
import { arbitrumSepolia, baseSepolia, optimismSepolia } from 'viem/chains'

/** An L2 the user can bridge USDC from to pay on the app chain. */
export type L2Source = Readonly<{
  chain: Chain
  /** Circle's USDC on this L2 (6 decimals). */
  usdc: Address
  /** Primary first. The manager's drpc key does not allow L2s. */
  rpcUrls: readonly string[]
}>

const L2_SOURCES: Readonly<Record<EnsNetwork, readonly L2Source[]>> = {
  sepolia: [
    {
      chain: baseSepolia,
      usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      rpcUrls: [
        'https://base-sepolia-rpc.publicnode.com',
        'https://sepolia.base.org',
      ],
    },
    {
      chain: arbitrumSepolia,
      usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      rpcUrls: [
        'https://arbitrum-sepolia-rpc.publicnode.com',
        'https://sepolia-rollup.arbitrum.io/rpc',
      ],
    },
    {
      chain: optimismSepolia,
      usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
      rpcUrls: [
        'https://optimism-sepolia-rpc.publicnode.com',
        'https://sepolia.optimism.io',
      ],
    },
  ],
  mainnet: [],
}

export const getL2Sources = (network: EnsNetwork): readonly L2Source[] =>
  L2_SOURCES[network]
