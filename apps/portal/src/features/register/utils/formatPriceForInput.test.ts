import { describe, expect, it } from 'vitest'
import { formatPriceForInput } from './formatPriceForInput'

describe('formatPriceForInput', () => {
  it('formats number with two decimal places', () => {
    expect(formatPriceForInput(100)).toBe('100.00')
  })

  it('adds thousands separators', () => {
    expect(formatPriceForInput(7680717.2)).toBe('7,680,717.20')
  })

  it('formats zero', () => {
    expect(formatPriceForInput(0)).toBe('0.00')
  })

  it('rounds to two decimal places', () => {
    expect(formatPriceForInput(99.999)).toBe('100.00')
  })

  it('formats small decimals', () => {
    expect(formatPriceForInput(0.5)).toBe('0.50')
  })
})
