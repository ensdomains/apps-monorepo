import { baseSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import type { L2Source } from '@/l2Sources'
import { getL2BridgeAmount, getL2PaymentOptions } from './paymentOptions'

const source = {
  chain: baseSepolia,
  usdc: '0x0000000000000000000000000000000000000001',
  rpcUrls: [],
} as L2Source

describe('getL2BridgeAmount', () => {
  it('bridges the whole wallet debit, so the L2 pays for the registration', () => {
    expect(getL2BridgeAmount(5_000_000n)).toBe(5_000_000n)
  })

  it('raises a small debit to the bridge minimum', () => {
    expect(getL2BridgeAmount(400_000n)).toBe(1_000_000n)
  })

  it('bridges nothing when the registration takes nothing from the wallet', () => {
    expect(getL2BridgeAmount(0n)).toBe(0n)
  })
})

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
      'only the bridge amount',
      { [baseSepolia.id]: 2_000_000n },
      2_000_000n,
    ],
    [
      'available',
      'above the bridge amount',
      { [baseSepolia.id]: 2_000_001n },
      2_000_000n,
    ],
  ] as const)('is %s for %s', (status, _, balances, bridgeAmountRaw) => {
    expect(
      getL2PaymentOptions({ sources: [source], balances, bridgeAmountRaw }).map(
        ({ id, status }) => [id, status],
      ),
    ).toEqual([[`l2:${baseSepolia.id}:usdc`, status]])
  })
})
