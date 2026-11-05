import { HcaBudgetUnquotedError } from '@ens-apps/smart-account'
import { describe, expect, it } from 'vitest'
import {
  getBudgetQuoteFailureCopy,
  getBudgetQuoteRecovery,
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

describe('getBudgetQuoteRecovery', () => {
  it('returns a gas-coverage recovery with the fallback estimate', () => {
    const recovery = getBudgetQuoteRecovery(
      new HcaBudgetUnquotedError(breakdown),
    )

    expect(recovery.kind).toBe('gas-coverage')
    expect(recovery.estimatedFunding).toEqual({
      registration: 1.4,
      networkFee: 10,
      total: 11.4,
      walletDebit: 11.4,
      walletDebitRaw: 11_400_000n,
      hcaCredit: 0,
    })
  })

  it('walks a wrapping cause chain for the unquoted breakdown', () => {
    const wrapped = new Error('EstimateHcaBudgetError', {
      cause: new HcaBudgetUnquotedError(breakdown),
    })
    wrapped.name = 'EstimateHcaBudgetError'

    expect(getBudgetQuoteRecovery(wrapped).kind).toBe('gas-coverage')
    expect(getBudgetQuoteRecovery(wrapped).estimatedFunding?.total).toBe(11.4)
  })

  it('stays generic when the failure carries no unquoted breakdown', () => {
    expect(
      getBudgetQuoteRecovery(new Error('orchestrator unavailable')),
    ).toEqual({
      kind: 'generic',
      estimatedFunding: null,
    })
  })

  it('classifies a non-gas fallback as generic while still exposing the estimate', () => {
    const recovery = getBudgetQuoteRecovery(
      new HcaBudgetUnquotedError({
        ...breakdown,
        fallbackReasons: [
          'commit: quote threw — timeout',
          'register: no quote',
        ],
      }),
    )

    expect(recovery.kind).toBe('generic')
    expect(recovery.estimatedFunding?.total).toBe(11.4)
  })
})

describe('getBudgetQuoteFailureCopy', () => {
  it.each([
    [
      'gas coverage with an estimate',
      {
        recovery: {
          kind: 'gas-coverage' as const,
          estimatedFunding: null,
        },
        estimatedTotalLabel: '$11.40',
      },
      {
        variant: 'gas-coverage-with-estimate',
        estimatedTotalLabel: '$11.40',
      },
    ],
    [
      'gas coverage without an estimate',
      {
        recovery: { kind: 'gas-coverage' as const, estimatedFunding: null },
        estimatedTotalLabel: null,
      },
      { variant: 'gas-coverage' },
    ],
    [
      'a generic failure',
      {
        recovery: { kind: 'generic' as const, estimatedFunding: null },
        estimatedTotalLabel: '$11.40',
      },
      { variant: 'generic' },
    ],
  ] as const)('picks %s', (_name, input, expected) => {
    expect(getBudgetQuoteFailureCopy(input)).toEqual(expected)
  })
})
