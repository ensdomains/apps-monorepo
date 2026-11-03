import { baseSepolia, optimismSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  getCurrentMethodState,
  getFallbackPaymentChoice,
  type PayableMethod,
  shouldShowWalletShortfall,
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
      current: 'payable' as const,
      payableMethods: [l2(baseSepolia.id, 48_340_000n)],
      expected: undefined,
    },
    {
      case: 'has nothing to switch to when nothing can pay',
      current: 'short' as const,
      payableMethods: [],
      expected: undefined,
    },
    {
      case: 'takes the only method that can pay',
      current: 'short' as const,
      payableMethods: [l2(optimismSepolia.id, 19_330_000n)],
      expected: { kind: 'l2', chainId: optimismSepolia.id },
    },
    {
      case: 'takes the method holding the most',
      current: 'short' as const,
      payableMethods: [
        l2(optimismSepolia.id, 19_330_000n),
        l2(baseSepolia.id, 48_340_000n),
      ],
      expected: { kind: 'l2', chainId: baseSepolia.id },
    },
    {
      case: 'keeps list order on a tie, so the wallet wins',
      current: 'short' as const,
      payableMethods: [wallet(20_000_000n), l2(baseSepolia.id, 20_000_000n)],
      expected: { kind: 'wallet', symbol: 'USDC' },
    },
    {
      case: 'compares balances across decimals',
      current: 'short' as const,
      payableMethods: [
        l2(baseSepolia.id, 48_000_000n),
        wallet(50n * 10n ** 18n, 18),
      ],
      expected: { kind: 'wallet', symbol: 'DAI' },
    },
    {
      case: 'with nothing chosen, takes a wallet coin that can pay over a bigger L2',
      current: 'none' as const,
      payableMethods: [wallet(20_000_000n), l2(baseSepolia.id, 48_340_000n)],
      expected: { kind: 'wallet', symbol: 'USDC' },
    },
    {
      case: 'with nothing chosen and no wallet coin that can pay, takes the L2 holding the most',
      current: 'none' as const,
      payableMethods: [
        l2(optimismSepolia.id, 19_330_000n),
        l2(baseSepolia.id, 48_340_000n),
      ],
      expected: { kind: 'l2', chainId: baseSepolia.id },
    },
    {
      case: 'moves an L2 it picked back to a wallet coin that can now pay',
      current: 'auto' as const,
      payableMethods: [wallet(20_000_000n), l2(baseSepolia.id, 48_340_000n)],
      expected: { kind: 'wallet', symbol: 'USDC' },
    },
    {
      case: 'keeps an L2 it picked while no wallet coin can pay',
      current: 'auto' as const,
      payableMethods: [
        l2(optimismSepolia.id, 19_330_000n),
        l2(baseSepolia.id, 48_340_000n),
      ],
      expected: undefined,
    },
    {
      case: "keeps the user's own pick that falls short",
      current: 'chosen' as const,
      payableMethods: [l2(baseSepolia.id, 48_340_000n)],
      expected: undefined,
    },
  ])('$case', ({ current, payableMethods, expected }) => {
    expect(getFallbackPaymentChoice({ current, payableMethods })).toEqual(
      expected,
    )
  })
})

describe('getCurrentMethodState', () => {
  it.each([
    ['nothing selected', undefined, 'none'],
    [
      'a user pick that can pay',
      { kind: 'wallet', isPayable: true, origin: 'user' },
      'payable',
    ],
    [
      'a user pick that falls short',
      { kind: 'wallet', isPayable: false, origin: 'user' },
      'chosen',
    ],
    [
      'ETH that falls short',
      { kind: 'eth', isPayable: false, origin: 'user' },
      'chosen',
    ],
    [
      'an app pick that falls short',
      { kind: 'wallet', isPayable: false, origin: 'fallback' },
      'short',
    ],
    [
      'a default or resumed pick that falls short',
      { kind: 'wallet', isPayable: false, origin: undefined },
      'short',
    ],
    [
      'an L2 the app picked',
      { kind: 'l2', isPayable: true, origin: 'fallback' },
      'auto',
    ],
    [
      'a wallet coin the app picked',
      { kind: 'wallet', isPayable: true, origin: 'fallback' },
      'payable',
    ],
  ] as const)('%s', (_case, selected, expected) => {
    expect(getCurrentMethodState(selected)).toBe(expected)
  })
})

describe('shouldShowWalletShortfall', () => {
  const short = {
    isShort: true,
    current: 'short' as const,
    hasFallback: false,
    isSettling: false,
  }

  it.each([
    [
      'the user picked it',
      { current: 'chosen' as const, hasFallback: true },
      true,
    ],
    ['nothing else can take over', {}, true],
    ['another method will take over', { hasFallback: true }, false],
    ['another method is still loading', { isSettling: true }, false],
    ['it can pay', { isShort: false }, false],
  ])('%s', (_case, overrides, expected) => {
    expect(shouldShowWalletShortfall({ ...short, ...overrides })).toBe(expected)
  })
})
