import { HcaBudgetUnquotedError } from '@ens-apps/smart-account'
import { describe, expect, it } from 'vitest'
import {
  getBudgetQuoteRecovery,
  getCheckoutReceiptTotalRaw,
} from './budgetQuoteRecovery'

const breakdown = {
  total: 11_400_000n,
  commitCost: 5_000_000n,
  registerCost: 5_000_000n,
  registrationPrice: 1_400_000n,
  expectedMaximum: 46_400_000n,
  source: 'fallback' as const,
  fallbackReasons: [
    'commit: quote threw — No available destination-chain balance can cover execution gas. An unsponsored intent must leave a spendable destination-chain token balance for the gas refund.',
    'register: quote threw — No available destination-chain balance can cover execution gas.',
  ],
}

const GENERIC = { kind: 'generic', registrationPriceRaw: null }

describe('getBudgetQuoteRecovery', () => {
  it('keeps only the name price from a gas-coverage refusal, never its fallback fees', () => {
    expect(
      getBudgetQuoteRecovery(new HcaBudgetUnquotedError(breakdown)),
    ).toEqual({ kind: 'gas-coverage', registrationPriceRaw: 1_400_000n })
  })

  it('walks a wrapping cause chain for the refusal', () => {
    const wrapped = new Error('EstimateHcaBudgetError', {
      cause: new HcaBudgetUnquotedError(breakdown),
    })

    expect(getBudgetQuoteRecovery(wrapped)).toEqual({
      kind: 'gas-coverage',
      registrationPriceRaw: 1_400_000n,
    })
  })

  it.each([
    ['a failure with no unquoted breakdown', new Error('orchestrator down')],
    [
      'a non-gas fallback',
      new HcaBudgetUnquotedError({
        ...breakdown,
        fallbackReasons: ['commit: quote threw — timeout'],
      }),
    ],
  ])('stays generic for %s', (_name, error) => {
    expect(getBudgetQuoteRecovery(error)).toEqual(GENERIC)
  })
})

describe('getCheckoutReceiptTotalRaw', () => {
  it.each([
    ['a refusal uses the name price', true, 1_400_000n, 900_000n, 1_400_000n],
    [
      'a refused first quote fills the missing total',
      true,
      1_400_000n,
      undefined,
      1_400_000n,
    ],
    ['any other failure keeps the page total', true, null, 900_000n, 900_000n],
    [
      'a successful quote keeps the page total',
      false,
      1_400_000n,
      900_000n,
      900_000n,
    ],
  ] as const)(
    '%s',
    (_name, hasBudgetQuoteFailed, registrationPriceRaw, totalRaw, expected) => {
      expect(
        getCheckoutReceiptTotalRaw({
          hasBudgetQuoteFailed,
          registrationPriceRaw,
          totalRaw,
        }),
      ).toBe(expected)
    },
  )
})
