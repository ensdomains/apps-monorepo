import { describe, expect, it } from 'vitest'
import {
  determinePremium,
  getErrorMessage,
  getPremiumLabel,
  isNameAvailabilityError,
  NameAvailabilityError,
} from './nameUtils'

describe('register utils', () => {
  describe('determinePremium', () => {
    it('should return true for 1 character names', () => {
      expect(determinePremium('a')).toBe(true)
      expect(determinePremium('a.eth')).toBe(true)
    })

    it('should return true for 2 character names', () => {
      expect(determinePremium('ab')).toBe(true)
      expect(determinePremium('ab.eth')).toBe(true)
    })

    it('should return true for 3 character names', () => {
      expect(determinePremium('abc')).toBe(true)
      expect(determinePremium('abc.eth')).toBe(true)
    })

    it('should return true for 4 character names', () => {
      expect(determinePremium('abcd')).toBe(true)
      expect(determinePremium('abcd.eth')).toBe(true)
    })

    it('should return false for 5+ character names', () => {
      expect(determinePremium('abcde')).toBe(false)
      expect(determinePremium('abcde.eth')).toBe(false)
    })

    it('should handle whitespace', () => {
      expect(determinePremium('  abc  ')).toBe(true)
    })

    it('should handle uppercase', () => {
      expect(determinePremium('ABC')).toBe(true)
      expect(determinePremium('ABC.ETH')).toBe(true)
    })

    it('should return false for empty name', () => {
      expect(determinePremium('')).toBe(false)
      expect(determinePremium('.eth')).toBe(false)
    })

    it('should count emojis as single characters (code points)', () => {
      expect(determinePremium('🎲🎲🎲')).toBe(true) // 3 code points = premium
      expect(determinePremium('🎲🎲🎲🎲')).toBe(true) // 4 code points = premium
      expect(determinePremium('🎲🎲🎲🎲🎲')).toBe(false) // 5 code points = not premium
      expect(determinePremium('🎲🎲🎲.eth')).toBe(true)
    })
  })

  describe('getPremiumLabel', () => {
    it('should return premium-3 variant for 1-3 character names', () => {
      expect(getPremiumLabel('a')).toEqual({
        label: '1 character premium name',
        variant: 'premium-3',
      })
      expect(getPremiumLabel('ab')).toEqual({
        label: '2 character premium name',
        variant: 'premium-3',
      })
      expect(getPremiumLabel('abc')).toEqual({
        label: '3 character premium name',
        variant: 'premium-3',
      })
    })

    it('should return premium-4 variant for 4 character names', () => {
      expect(getPremiumLabel('abcd')).toEqual({
        label: '4 character premium name',
        variant: 'premium-4',
      })
    })

    it('should return undefined for non-premium names', () => {
      expect(getPremiumLabel('abcde')).toBeUndefined()
      expect(getPremiumLabel('abcdefgh')).toBeUndefined()
    })

    it('should handle .eth suffix', () => {
      expect(getPremiumLabel('abc.eth')).toEqual({
        label: '3 character premium name',
        variant: 'premium-3',
      })
    })

    it('should return undefined for empty name', () => {
      expect(getPremiumLabel('')).toBeUndefined()
    })

    it('should return undefined for only .eth', () => {
      expect(getPremiumLabel('.eth')).toBeUndefined()
    })

    it('should return undefined for names with multiple dots (subdomains)', () => {
      // Names with multiple dots like 'abc.sub.eth' have a label of 'abc.sub'
      // which is longer than 4 characters, so they are not premium
      expect(getPremiumLabel('abc.sub.eth')).toBeUndefined()
    })

    it('should count emojis as single characters (code points)', () => {
      expect(getPremiumLabel('🎲🎲🎲')).toEqual({
        label: '3 character premium name',
        variant: 'premium-3',
      })
      expect(getPremiumLabel('🎲🎲🎲🎲')).toEqual({
        label: '4 character premium name',
        variant: 'premium-4',
      })
      expect(getPremiumLabel('🎲🎲🎲🎲🎲')).toBeUndefined() // 5 code points = not premium
    })
  })

  describe('isNameAvailabilityError', () => {
    it('should return true for NameAvailabilityError instances', () => {
      const error = new NameAvailabilityError({ cause: 'Not available' })
      expect(isNameAvailabilityError(error)).toBe(true)
    })

    it('should return false for regular Error', () => {
      const error = new Error('Regular error')
      expect(isNameAvailabilityError(error)).toBe(false)
    })

    it('should return false for string', () => {
      expect(isNameAvailabilityError('error string')).toBe(false)
    })

    it('should return false for null', () => {
      expect(isNameAvailabilityError(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isNameAvailabilityError(undefined)).toBe(false)
    })

    it('should return false for plain object', () => {
      expect(isNameAvailabilityError({ message: 'error' })).toBe(false)
    })
  })

  describe('getErrorMessage', () => {
    it('should return cause for NameAvailabilityError', () => {
      const error = new NameAvailabilityError({ cause: 'Name not available' })
      expect(getErrorMessage(error)).toBe('Name not available')
    })

    it('should return the error itself for other error types', () => {
      const error = new Error('Regular error')
      expect(getErrorMessage(error)).toBe(error)
    })

    it('should return string as-is', () => {
      expect(getErrorMessage('error string')).toBe('error string')
    })

    it('should return null as-is', () => {
      expect(getErrorMessage(null)).toBeNull()
    })

    it('should return undefined as-is', () => {
      expect(getErrorMessage(undefined)).toBeUndefined()
    })
  })
})
