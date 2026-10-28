import { baseSepolia, optimismSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  getFallbackPaymentChoice,
  type PayableMethod,
} from './fallbackPaymentChoice'

const wallet = (balanceRaw: bigint, decimals = 6): PayableMethod => ({
  choice: { kind: 'wallet', symbol: decimals === 6 ? 'USDC' : 'DAI' },
  balanceRaw,
  decimals,
})

const l2 = (chainId: number, balanceRaw: bigint): PayableMethod => ({
  choice: { kind: 'l2', chainId },
  balanceRaw,
  decimals: 6,
})

describe('getFallbackPaymentChoice', () => {
  it.each([
    {
      case: 'keeps a current method that can pay',
      isCurrentPayable: true,
      payableMethods: [l2(baseSepolia.id, 48_340_000n)],
      expected: undefined,
    },
    {
      case: 'has nothing to switch to when nothing can pay',
      isCurrentPayable: false,
      payableMethods: [],
      expected: undefined,
    },
    {
      case: 'takes the only method that can pay',
      isCurrentPayable: false,
      payableMethods: [l2(optimismSepolia.id, 19_330_000n)],
      expected: { kind: 'l2', chainId: optimismSepolia.id },
    },
    {
      case: 'takes the method holding the most',
      isCurrentPayable: false,
      payableMethods: [
        l2(optimismSepolia.id, 19_330_000n),
        l2(baseSepolia.id, 48_340_000n),
      ],
      expected: { kind: 'l2', chainId: baseSepolia.id },
    },
    {
      case: 'keeps list order on a tie, so the wallet wins',
      isCurrentPayable: false,
      payableMethods: [wallet(20_000_000n), l2(baseSepolia.id, 20_000_000n)],
      expected: { kind: 'wallet', symbol: 'USDC' },
    },
    {
      case: 'compares balances across decimals',
      isCurrentPayable: false,
      payableMethods: [
        l2(baseSepolia.id, 48_000_000n),
        wallet(50n * 10n ** 18n, 18),
      ],
      expected: { kind: 'wallet', symbol: 'DAI' },
    },
  ])('$case', ({ isCurrentPayable, payableMethods, expected }) => {
    expect(
      getFallbackPaymentChoice({ isCurrentPayable, payableMethods }),
    ).toEqual(expected)
  })
})
