import { describe, expect, it } from 'vitest'
import { type DrpcNetwork, drpcRpcUrl } from './drpc'
import { getL2Sources } from './l2Sources'

/**
 * The L2s a build reads balances on, by network.
 *
 * Two regressions are pinned here. The mainnet build once had no sources at
 * all, so the picker showed no L2 rows and a wallet holding USDC on Base,
 * Arbitrum or OP could not pay from it (Sepolia worked). And a source must
 * carry its own network's Circle USDC and drpc slug: a testnet token address
 * or a `base-sepolia` slug in the mainnet table reads as a zero balance
 * forever.
 */
type ExpectedSource = Readonly<{ usdc: string; drpc: DrpcNetwork }>

const EXPECTED: Readonly<
  Record<'mainnet' | 'sepolia', Readonly<Record<string, ExpectedSource>>>
> = {
  mainnet: {
    '8453': {
      usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      drpc: 'base',
    },
    '42161': {
      usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      drpc: 'arbitrum',
    },
    '10': {
      usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      drpc: 'optimism',
    },
  },
  sepolia: {
    '84532': {
      usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      drpc: 'base-sepolia',
    },
    '421614': {
      usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      drpc: 'arbitrum-sepolia',
    },
    '11155420': {
      usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
      drpc: 'optimism-sepolia',
    },
  },
}

describe('getL2Sources', () => {
  for (const network of ['mainnet', 'sepolia'] as const) {
    it(`lists ${network} L2s with their own Circle USDC`, () => {
      const sources = getL2Sources(network)
      expect(
        Object.fromEntries(
          sources.map((source) => [
            String(source.chain.id),
            source.usdc.toLowerCase(),
          ]),
        ),
      ).toEqual(
        Object.fromEntries(
          Object.entries(EXPECTED[network]).map(([chainId, { usdc }]) => [
            chainId,
            usdc.toLowerCase(),
          ]),
        ),
      )
    })

    it(`reads ${network} L2s over drpc first`, () => {
      for (const source of getL2Sources(network)) {
        const expected = EXPECTED[network][String(source.chain.id)]
        if (!expected) {
          throw new Error(`No expectation for chain ${source.chain.id}`)
        }
        expect(source.rpcUrls[0]).toBe(drpcRpcUrl(expected.drpc))
      }
    })
  }

  it('gives every source a public fallback when drpc refuses the chain', () => {
    for (const network of ['mainnet', 'sepolia'] as const) {
      for (const source of getL2Sources(network)) {
        expect(source.rpcUrls.length).toBeGreaterThan(1)
        for (const url of source.rpcUrls.slice(1)) {
          expect(url).not.toContain('lb.drpc.live')
        }
        expect(source.client.chain?.id).toBe(source.chain.id)
      }
    }
  })
})
