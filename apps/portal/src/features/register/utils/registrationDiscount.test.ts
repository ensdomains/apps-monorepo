import { describe, expect, it } from 'vitest'
import { formatDiscountPercentForDisplay } from './registrationDiscount'

describe('registrationDiscount', () => {
  describe('formatDiscountPercentForDisplay', () => {
    it('returns "0%" for zero or negative', () => {
      expect(formatDiscountPercentForDisplay(0)).toBe('0%')
      expect(formatDiscountPercentForDisplay(-1)).toBe('0%')
    })

    it('formats whole numbers without decimals', () => {
      expect(formatDiscountPercentForDisplay(10)).toBe('10%')
      expect(formatDiscountPercentForDisplay(20)).toBe('20%')
    })

    it('formats decimals with one decimal place', () => {
      expect(formatDiscountPercentForDisplay(17.5)).toBe('17.5%')
    })

    it('strips trailing .0 (e.g. 41.0 → "41%")', () => {
      expect(formatDiscountPercentForDisplay(41.0)).toBe('41%')
    })
  })
})
