import { describe, expect, it, vi } from 'vitest'
import {
  createRegistrationAnalytics,
  getRegistrationAnalyticsStep,
} from './registrationAnalytics'

describe('getRegistrationAnalyticsStep', () => {
  it.each([
    ['checkingResolver', 'setup'],
    ['waitingForResolverDeployment', 'setup'],
    ['committingTransaction', 'commit'],
    ['waitingForCommitment', 'commit'],
    ['commitmentCooldown', 'cooldown'],
    ['approvingToken', 'approval'],
    ['waitingForRegistration', 'registration'],
    ['verifyingRegistration', 'verification'],
    ['success', undefined],
    ['error', undefined],
    ['idle', undefined],
  ])('groups %s into %s', (state, expected) => {
    expect(getRegistrationAnalyticsStep(state)).toBe(expected)
  })
})

describe('registration journey observation', () => {
  it('retains one flow through a failed step and retry, and completes once after verification', () => {
    const capture = vi.fn()
    const analytics = createRegistrationAnalytics(11155111, { capture })
    const observe = (value: string, retryTarget?: string) =>
      analytics.observe({ value, context: { retryTarget } })
    analytics.start(false)
    observe('committingTransaction')
    observe('waitingForCommitment')
    observe('error', 'committingTransaction')
    analytics.retry()
    observe('committingTransaction')
    observe('waitingForCommitment')
    expect(
      capture.mock.calls.filter(
        ([name]) => name === 'registration:flow_complete',
      ),
    ).toEqual([])
    observe('commitmentCooldown')
    observe('registeringDomain')
    observe('verifyingRegistration')
    observe('success')
    observe('success')
    expect(capture.mock.calls.map(([name]) => name)).toEqual([
      'registration:flow_start',
      'registration:step_view',
      'registration:step_result',
      'registration:flow_retry',
      'registration:step_view',
      'registration:step_result',
      'registration:step_view',
      'registration:step_result',
      'registration:step_view',
      'registration:step_result',
      'registration:step_view',
      'registration:step_result',
      'registration:flow_complete',
    ])
    expect(capture.mock.calls[2]?.[1]).toEqual({
      flow_id: capture.mock.calls[0]?.[1].flow_id,
      execution_method: 'eoa',
      chain_id: 11155111,
      step: 'commit',
      outcome: 'failure',
      error_code: 'transaction_failed',
      is_retryable: true,
    })
    expect(
      new Set(capture.mock.calls.map(([, properties]) => properties.flow_id))
        .size,
    ).toBe(1)
  })
})
