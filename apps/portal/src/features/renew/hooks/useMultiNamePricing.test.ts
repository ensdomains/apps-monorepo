import { describe, expect, it } from 'vitest'
import { getLatestRenewalExpiry } from './useMultiNamePricing'

describe('useMultiNamePricing pure helpers', () => {
  describe('getLatestRenewalExpiry', () => {
    it('returns the latest expiry date across selected names', () => {
      const latest = new Date('2027-06-15T00:00:00.000Z')
      const result = getLatestRenewalExpiry([
        {
          name: 'alpha.eth',
          isV2: false,
          expiryDate: new Date('2026-01-01T00:00:00.000Z'),
        },
        { name: 'beta.eth', isV2: true, expiryDate: latest },
        {
          name: 'gamma.eth',
          isV2: false,
          expiryDate: new Date('2027-03-10T00:00:00.000Z'),
        },
      ])

      expect(result).toEqual(latest)
    })

    it('ignores names without an expiry date', () => {
      const latest = new Date('2026-08-20T00:00:00.000Z')
      const result = getLatestRenewalExpiry([
        { name: 'alpha.eth', isV2: false, expiryDate: null },
        { name: 'beta.eth', isV2: true },
        { name: 'gamma.eth', isV2: false, expiryDate: latest },
      ])

      expect(result).toEqual(latest)
    })

    it('returns null when no names have an expiry date', () => {
      const result = getLatestRenewalExpiry([
        { name: 'alpha.eth', isV2: false, expiryDate: null },
        { name: 'beta.eth', isV2: true },
      ])

      expect(result).toBeNull()
    })
  })
})
