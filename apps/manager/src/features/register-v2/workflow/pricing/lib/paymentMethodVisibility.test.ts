import { describe, expect, it } from 'vitest'
import { getPaymentMethodVisibility } from './paymentMethodVisibility'

const methods = [
  { id: 'funded', isAvailable: true, isFunded: true, isCommon: true },
  { id: 'unfunded', isAvailable: true, isFunded: false, isCommon: true },
  { id: 'unavailable', isAvailable: false, isFunded: true, isCommon: false },
] as const

describe('getPaymentMethodVisibility', () => {
  it('shows only available, funded methods by default', () => {
    const result = getPaymentMethodVisibility(methods, false)

    expect(result.visibleMethods.map(({ id }) => id)).toEqual(['funded'])
    expect(result.hiddenCount).toBe(2)
  })

  it('reveals every supplied method in stable order', () => {
    const result = getPaymentMethodVisibility(methods, true)

    expect(result.visibleMethods.map(({ id }) => id)).toEqual([
      'funded',
      'unfunded',
      'unavailable',
    ])
    expect(result.hiddenCount).toBe(0)
  })

  it('falls back to supplied common methods when none is valid', () => {
    const noValidMethods = methods.map((method) => ({
      ...method,
      isAvailable: false,
      isFunded: false,
    }))

    const result = getPaymentMethodVisibility(noValidMethods, false)

    expect(result.visibleMethods.map(({ id }) => id)).toEqual([
      'funded',
      'unfunded',
    ])
    expect(result.hiddenCount).toBe(1)
  })

  it('handles an empty supplied list', () => {
    expect(getPaymentMethodVisibility([], false)).toEqual({
      visibleMethods: [],
      hiddenCount: 0,
    })
  })
})
