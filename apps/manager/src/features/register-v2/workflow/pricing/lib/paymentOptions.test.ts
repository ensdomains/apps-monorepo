import { baseSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import type { L2Source } from '@/l2Sources'
import { getL2PaymentOptions, getSelectedL2ChainId } from './paymentOptions'

const source = {
  chain: baseSepolia,
  usdc: '0x0000000000000000000000000000000000000001',
  rpcUrls: [],
  client: {} as L2Source['client'],
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
      'available',
      'nothing to bridge, since the account credit covers it',
      { [baseSepolia.id]: 0n },
      0n,
    ],
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

describe('getSelectedL2ChainId', () => {
  const optionsWith = (balance: bigint | null) =>
    getL2PaymentOptions({
      sources: [source],
      balances: { [baseSepolia.id]: balance },
      amountRaw: 0n,
    })

  it.each([
    ['keeps a chosen L2 the wallet holds USDC on', 1n, baseSepolia.id],
    ['keeps a chosen L2 whose balance could not be read', null, baseSepolia.id],
    ['drops a chosen L2 the wallet holds nothing on', 0n, undefined],
  ] as const)('%s', (_, balance, expected) => {
    expect(getSelectedL2ChainId(optionsWith(balance), baseSepolia.id)).toBe(
      expected,
    )
  })

  it('selects nothing for a chain with no row', () => {
    expect(getSelectedL2ChainId(optionsWith(1n), 1)).toBeUndefined()
  })

  it.each([
    ['drops a chosen L2 with nothing to bridge', 0n, undefined],
    ['keeps it while there is something to bridge', 2_000_000n, baseSepolia.id],
  ] as const)('%s', (_, amountRaw, expected) => {
    expect(
      getSelectedL2ChainId(optionsWith(1n), baseSepolia.id, amountRaw),
    ).toBe(expected)
  })
})
