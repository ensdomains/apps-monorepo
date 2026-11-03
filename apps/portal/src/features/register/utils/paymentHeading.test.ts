import { describe, expect, it } from 'vitest'
import { getPaymentHeading } from './paymentHeading'

describe('getPaymentHeading', () => {
  it.each([
    ['renew', false, 'Select payment method (Mainnet USDC)'],
    ['renew', true, 'Select payment method'],
    ['register', false, 'Select payment method'],
  ] as const)('%s with isSepolia %s reads %s', (mode, isSepolia, expected) => {
    expect(getPaymentHeading(mode, isSepolia)).toBe(expected)
  })
})
