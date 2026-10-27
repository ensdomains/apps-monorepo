import { describe, expect, it } from 'vitest'
import { getL2Sources } from './l2Sources'

/**
 * The L2s a build reads balances on, by network.
 *
 * This is a regression test for the mainnet build having no sources at all:
 * the picker then showed no L2 rows, so a wallet holding USDC on Base,
 * Arbitrum or OP could not pay from it (Sepolia worked). Each network must
 * list its own chains AND its own Circle USDC — a testnet token address in the
 * mainnet table would read as a zero balance forever.
 */
const EXPECTED = {
  mainnet: {
    '8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    '42161': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    '10': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
  sepolia: {
    '84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    '421614': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    '11155420': '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  },
} as const

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
          Object.entries(EXPECTED[network]).map(([chainId, usdc]) => [
            chainId,
            usdc.toLowerCase(),
          ]),
        ),
      )
    })
  }

  it('gives every source an RPC to read it over', () => {
    for (const network of ['mainnet', 'sepolia'] as const) {
      for (const source of getL2Sources(network)) {
        expect(source.rpcUrls.length).toBeGreaterThan(0)
        expect(source.client.chain?.id).toBe(source.chain.id)
      }
    }
  })
})
