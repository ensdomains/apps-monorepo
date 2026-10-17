import { baseSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import type { L2Source } from '@/l2Sources'
import { getL2PaymentOptions } from './paymentOptions'

const source = {
  chain: baseSepolia,
  usdc: '0x0000000000000000000000000000000000000001',
  rpcUrls: [],
} as L2Source

describe('getL2PaymentOptions', () => {
  it.each([
    ['loading', 'not read yet', undefined, 2_000_000n],
    [
      'loading',
      'read, before the cost is quoted',
      { [baseSepolia.id]: 9n },
      null,
    ],
    ['unavailable', 'a failed read', { [baseSepolia.id]: null }, 2_000_000n],
    [
      'insufficient',
      'only what the HCA is sent, with nothing for the fee',
      { [baseSepolia.id]: 2_000_000n },
      2_000_000n,
    ],
    [
      'available',
      'above what the HCA is sent',
      { [baseSepolia.id]: 2_000_001n },
      2_000_000n,
    ],
  ] as const)('is %s for %s', (status, _, balances, amountRaw) => {
    expect(
      getL2PaymentOptions({ sources: [source], balances, amountRaw }).map(
        ({ id, status }) => [id, status],
      ),
    ).toEqual([[`l2:${baseSepolia.id}:usdc`, status]])
  })
})
