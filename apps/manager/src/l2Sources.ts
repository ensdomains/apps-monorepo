import type { EnsNetwork } from '@ens-apps/config'
import {
  type Address,
  type Chain,
  createPublicClient,
  type PublicClient,
} from 'viem'
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
} from 'viem/chains'
import { failover } from '@/lib/rpc'
import { drpcRpcUrl } from './drpc'

/** An L2 the user can bridge USDC from to pay on the app chain. */
export type L2Source = Readonly<{
  chain: Chain
  /** Circle's USDC on this L2 (6 decimals). */
  usdc: Address
  /**
   * Primary first: the manager's drpc gateway, then the public fallbacks. The
   * browser CSP is built from this list, so an endpoint added here is allowed
   * without a second edit.
   */
  rpcUrls: readonly string[]
  /**
   * Reads on this L2, built once from `rpcUrls` and shared with wagmi, which
   * registers the same transport for the chain.
   */
  client: PublicClient
}>

/** A source before its read client is built for the configured network. */
type L2SourceRpcs = Omit<L2Source, 'client'>

const L2_SOURCES: Readonly<Record<EnsNetwork, readonly L2SourceRpcs[]>> = {
  sepolia: [
    {
      chain: baseSepolia,
      usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      rpcUrls: [
        drpcRpcUrl('base-sepolia'),
        'https://base-sepolia-rpc.publicnode.com',
        'https://sepolia.base.org',
      ],
    },
    {
      chain: arbitrumSepolia,
      usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      rpcUrls: [
        drpcRpcUrl('arbitrum-sepolia'),
        'https://arbitrum-sepolia-rpc.publicnode.com',
        'https://sepolia-rollup.arbitrum.io/rpc',
      ],
    },
    {
      chain: optimismSepolia,
      usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
      rpcUrls: [
        drpcRpcUrl('optimism-sepolia'),
        'https://optimism-sepolia-rpc.publicnode.com',
        'https://sepolia.optimism.io',
      ],
    },
  ],
  mainnet: [
    {
      chain: base,
      usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      rpcUrls: [
        drpcRpcUrl('base'),
        'https://base-rpc.publicnode.com',
        'https://mainnet.base.org',
      ],
    },
    {
      chain: arbitrum,
      usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      rpcUrls: [
        drpcRpcUrl('arbitrum'),
        'https://arbitrum-one-rpc.publicnode.com',
        'https://arb1.arbitrum.io/rpc',
      ],
    },
    {
      chain: optimism,
      usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      rpcUrls: [
        drpcRpcUrl('optimism'),
        'https://optimism-rpc.publicnode.com',
        'https://mainnet.optimism.io',
      ],
    },
  ],
}

export const getL2Sources = (network: EnsNetwork): readonly L2Source[] =>
  L2_SOURCES[network].map((source) => ({
    ...source,
    client: createPublicClient({
      chain: source.chain,
      transport: failover(source.rpcUrls),
    }),
  }))
