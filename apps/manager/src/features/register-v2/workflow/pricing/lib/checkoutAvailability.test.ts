import { describe, expect, it } from 'vitest'
import {
  type CheckoutAvailability,
  getCheckoutAction,
  getCheckoutAvailability,
  knownBalance,
  type PaymentSources,
  UNKNOWN_BALANCE,
} from './checkoutAvailability'

const TOTAL = 330_000_000n
const enough = knownBalance(TOTAL)
const short = knownBalance(100_000_000n)

const sources = (overrides: Partial<PaymentSources> = {}): PaymentSources => ({
  wallet: short,
  l2s: [short],
  eth: short,
  ...overrides,
})

describe('getCheckoutAvailability', () => {
  it.each<[string, PaymentSources, CheckoutAvailability]>([
    ['the wallet covers it', sources({ wallet: enough }), 'payable'],
    ['one L2 covers it', sources({ l2s: [short, enough] }), 'payable'],
    [
      'ETH alone covers it',
      sources({ wallet: UNKNOWN_BALANCE, eth: enough }),
      'payable',
    ],
    [
      'wallet USDC and ETH cover it together',
      sources({
        wallet: knownBalance(200_000_000n),
        eth: knownBalance(130_000_000n),
      }),
      'payable',
    ],
    ['every source is known and short', sources(), 'insufficient'],
    [
      'a short source is still loading',
      sources({ l2s: [UNKNOWN_BALANCE] }),
      'unknown',
    ],
    [
      'ETH is not offered',
      sources({ eth: undefined, l2s: [] }),
      'insufficient',
    ],
  ])('%s', (_case, input, expected) => {
    expect(getCheckoutAvailability(TOTAL, input)).toBe(expected)
  })

  it('treats an existing balance that covers everything as payable', () => {
    expect(
      getCheckoutAvailability(0n, sources({ wallet: knownBalance(0n) })),
    ).toBe('payable')
  })
})

describe('getCheckoutAction', () => {
  const ready = {
    isConnected: true,
    isPreparing: false,
    availability: 'payable',
    canNext: true,
  } as const

  it.each([
    ['disconnected', { ...ready, isConnected: false }, { kind: 'connect' }],
    ['preparing', { ...ready, isPreparing: true }, { kind: 'preparing' }],
    [
      'short',
      { ...ready, availability: 'insufficient' },
      { kind: 'insufficient' },
    ],
    [
      'unknown',
      { ...ready, availability: 'unknown' },
      { kind: 'continue', isEnabled: true },
    ],
    [
      'not yet priced',
      { ...ready, canNext: false },
      { kind: 'continue', isEnabled: false },
    ],
  ] as const)('%s', (_case, input, expected) => {
    expect(getCheckoutAction(input)).toEqual(expected)
  })
})
