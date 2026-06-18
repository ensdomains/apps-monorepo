import { describe, expect, it } from 'vitest'
import { authorizedPaymentAmount, generateSecret } from './fulfilment'
import { type CrossmintWebhookEvent, getClientReference } from './types'

describe('authorizedPaymentAmount', () => {
  it('adds 10% headroom to the live price', () => {
    expect(authorizedPaymentAmount(1000n)).toBe(1100n)
    expect(authorizedPaymentAmount(0n)).toBe(0n)
    // Integer division floors the headroom (no fractional wei).
    expect(authorizedPaymentAmount(5n)).toBe(5n)
  })
})

describe('generateSecret', () => {
  it('returns a 32-byte 0x-hex string', () => {
    const secret = generateSecret()
    expect(secret).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('is unique across calls (CSPRNG)', () => {
    expect(generateSecret()).not.toBe(generateSecret())
  })
})

describe('getClientReference', () => {
  const make = (
    data: CrossmintWebhookEvent['data'],
  ): CrossmintWebhookEvent => ({
    type: 'orders.payment.succeeded',
    data,
  })

  it('reads a top-level clientReference', () => {
    expect(getClientReference(make({ clientReference: 'order-1' }))).toBe(
      'order-1',
    )
  })

  it('falls back to metadata.clientReference', () => {
    expect(
      getClientReference(make({ metadata: { clientReference: 'order-2' } })),
    ).toBe('order-2')
  })

  it('prefers the top-level reference over metadata', () => {
    expect(
      getClientReference(
        make({
          clientReference: 'top',
          metadata: { clientReference: 'meta' },
        }),
      ),
    ).toBe('top')
  })

  it('returns undefined when absent', () => {
    expect(getClientReference(make({ orderId: 'cm-1' }))).toBeUndefined()
  })
})
