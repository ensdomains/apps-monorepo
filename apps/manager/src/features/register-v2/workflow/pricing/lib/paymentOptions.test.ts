import { baseSepolia, type optimismSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import type { L2Source } from '@/l2Sources'
import { getL2BridgeAmount, getL2PaymentOptions } from './paymentOptions'

const source = (chain: typeof baseSepolia | typeof optimismSepolia) =>
  ({
    chain,
    usdc: '0x0000000000000000000000000000000000000001',
    rpcUrls: [],
  }) as L2Source

describe('getL2BridgeAmount', () => {
  it('bridges exactly the shortfall above the minimum', () => {
    expect(
      getL2BridgeAmount({
        walletDebitRaw: 5_000_000n,
        walletBalanceRaw: 1_500_000n,
      }),
    ).toBe(3_500_000n)
  })

  it('raises a small shortfall to the bridge minimum', () => {
    expect(
      getL2BridgeAmount({
        walletDebitRaw: 5_000_000n,
        walletBalanceRaw: 4_900_000n,
      }),
    ).toBe(1_000_000n)
  })

  it('bridges nothing when the wallet already covers the debit', () => {
    expect(
      getL2BridgeAmount({
        walletDebitRaw: 5_000_000n,
        walletBalanceRaw: 5_000_000n,
      }),
    ).toBe(0n)
  })
})

describe('getL2PaymentOptions', () => {
  const statuses = (
    bridgeAmountRaw: bigint | null,
    balances: Record<number, bigint | null> | undefined,
  ) =>
    getL2PaymentOptions({
      sources: [source(baseSepolia)],
      balances,
      bridgeAmountRaw,
    }).map(({ id, status }) => [id, status])

  it.each([
    ['not-needed', 0n, { [baseSepolia.id]: 0n }],
    ['loading', null, { [baseSepolia.id]: 9_000_000n }],
    ['loading', 2_000_000n, undefined],
    ['unavailable', 2_000_000n, { [baseSepolia.id]: null }],
    ['insufficient', 2_000_000n, { [baseSepolia.id]: 2_000_000n }],
    ['available', 2_000_000n, { [baseSepolia.id]: 2_000_001n }],
  ] as const)(
    'is %s for a bridge of %s',
    (status, bridgeAmountRaw, balances) => {
      expect(statuses(bridgeAmountRaw, balances)).toEqual([
        [`l2:${baseSepolia.id}:usdc`, status],
      ])
    },
  )
})
