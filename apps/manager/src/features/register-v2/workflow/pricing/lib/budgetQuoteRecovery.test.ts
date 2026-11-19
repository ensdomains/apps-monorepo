import { HcaBudgetUnquotedError } from '@ens-apps/smart-account'
import { describe, expect, it } from 'vitest'
import { getBudgetQuoteFailureKind } from './budgetQuoteRecovery'

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

const refusal = new HcaBudgetUnquotedError(breakdown)

describe('getBudgetQuoteFailureKind', () => {
  it.each([
    ['no failure', false, refusal, null],
    ['a gas-coverage refusal', true, refusal, 'gas-coverage'],
    [
      'a refusal wrapped in a cause chain',
      true,
      new Error('EstimateHcaBudgetError', { cause: refusal }),
      'gas-coverage',
    ],
    [
      'a failure with no unquoted breakdown',
      true,
      new Error('orchestrator down'),
      'generic',
    ],
    [
      'a non-gas fallback',
      true,
      new HcaBudgetUnquotedError({
        ...breakdown,
        fallbackReasons: ['commit: quote threw — timeout'],
      }),
      'generic',
    ],
  ] as const)('classifies %s', (_name, hasFailed, error, expected) => {
    expect(getBudgetQuoteFailureKind({ hasFailed, error })).toBe(expected)
  })
})
