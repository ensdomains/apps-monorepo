import { describe, expect, it } from 'vitest'
import { sanitizeEventProperties } from './tracking'

describe('sanitizeEventProperties', () => {
  it('removes transaction context, addresses, URLs and unbounded values', () => {
    expect(
      sanitizeEventProperties('registration:step_result', {
        step: 'payment',
        outcome: 'failure',
        is_retryable: true,
        tm_payload: { calldata: '0x123' },
        wallet_address: '0x123',
        error_code: 'https://example.com/secret',
        reason: 'x'.repeat(101),
        operation_id: `0x${'a'.repeat(40)}`,
        attempt_count: Number.NaN,
      }),
    ).toEqual({ step: 'payment', outcome: 'failure', is_retryable: true })
  })
  it('retains names only for the existing statistics contract', () => {
    expect(
      sanitizeEventProperties('name:search_selected', {
        name: 'example.eth',
        source: 'header_search',
      }),
    ).toEqual({ name: 'example.eth', source: 'header_search' })
    expect(
      sanitizeEventProperties('dnssec_debug:result', {
        name: 'example.eth',
        verdict: 'secure',
      }),
    ).toEqual({ verdict: 'secure' })
  })
})
