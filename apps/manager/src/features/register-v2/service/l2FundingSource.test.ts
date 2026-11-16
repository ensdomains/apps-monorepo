import type { RhinestoneAccountConfig } from '@rhinestone/sdk'
import { baseSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { getL2QuoteRoute } from './l2FundingSource'

describe('getL2QuoteRoute', () => {
  it('asks the bridge for Circle’s USDC, the token the run then pays in', () => {
    const route = getL2QuoteRoute({
      owner: '0x1111111111111111111111111111111111111111',
      source: {
        chain: baseSepolia,
        usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      },
      hca: {
        address: '0x2222222222222222222222222222222222222222',
        config: {} as RhinestoneAccountConfig,
      },
      amountOut: 5_000_000n,
    })

    // Sepolia's MockUSDC has no bridge route, so the bridge delivers Circle's.
    expect(route.targetToken).toBe('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
  })
})
