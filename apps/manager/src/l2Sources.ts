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
import { L2_USDC } from './l2Usdc'

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
      usdc: L2_USDC[baseSepolia.id],
      rpcUrls: [
        drpcRpcUrl('base-sepolia'),
        'https://base-sepolia-rpc.publicnode.com',
        'https://sepolia.base.org',
      ],
    },
    {
      chain: arbitrumSepolia,
      usdc: L2_USDC[arbitrumSepolia.id],
      rpcUrls: [
        drpcRpcUrl('arbitrum-sepolia'),
        'https://arbitrum-sepolia-rpc.publicnode.com',
        'https://sepolia-rollup.arbitrum.io/rpc',
      ],
    },
    {
      chain: optimismSepolia,
      usdc: L2_USDC[optimismSepolia.id],
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
      usdc: L2_USDC[base.id],
      rpcUrls: [
        drpcRpcUrl('base'),
        'https://base-rpc.publicnode.com',
        'https://mainnet.base.org',
      ],
    },
    {
      chain: arbitrum,
      usdc: L2_USDC[arbitrum.id],
      rpcUrls: [
        drpcRpcUrl('arbitrum'),
        'https://arbitrum-one-rpc.publicnode.com',
        'https://arb1.arbitrum.io/rpc',
      ],
    },
    {
      chain: optimism,
      usdc: L2_USDC[optimism.id],
      rpcUrls: [
        drpcRpcUrl('optimism'),
        'https://optimism-rpc.publicnode.com',
        'https://mainnet.optimism.io',
      ],
    },
  ],
}

/**
 * `rpcOverrides` replaces a source's whole RPC list by chain id, so a build can
 * read an L2 from a local fork (the e2e stack) without touching the defaults.
 */
export const getL2Sources = (
  network: EnsNetwork,
  rpcOverrides: Readonly<Record<number, string>> = {},
): readonly L2Source[] =>
  L2_SOURCES[network].map((source) => {
    const override = rpcOverrides[source.chain.id]
    const rpcUrls = override ? [override] : source.rpcUrls
    return {
      ...source,
      rpcUrls,
      client: createPublicClient({
        chain: source.chain,
        transport: failover(rpcUrls),
      }),
    }
  })

/**
 * Per-L2 RPC overrides, as comma-separated `chainId=url` pairs (e2e points
 * Base Sepolia at a local fork with `84532=http://127.0.0.1:8547`).
 */
export const parseL2RpcOverrides = (
  value: string | undefined,
): Record<number, string> =>
  Object.fromEntries(
    (value ?? '')
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const separator = pair.indexOf('=')
        const chainId = Number(pair.slice(0, separator))
        const url = pair.slice(separator + 1).trim()
        if (separator < 1 || !Number.isInteger(chainId) || !url) {
          throw new Error(
            `VITE_L2_RPC_URLS: expected chainId=url, got "${pair}"`,
          )
        }
        return [chainId, url]
      }),
  )
