import { describe, expect, it } from 'vitest'
import {
  determinePremium,
  getPremiumLabel,
  validateNameLength,
} from './premium'

describe('determinePremium', () => {
  it('returns true for 3-character names', () => {
    expect(determinePremium('abc')).toBe(true)
    expect(determinePremium('xyz')).toBe(true)
    expect(determinePremium('abc.eth')).toBe(true)
  })

  it('returns true for 4-character names', () => {
    expect(determinePremium('abcd')).toBe(true)
    expect(determinePremium('test')).toBe(true)
    expect(determinePremium('test.eth')).toBe(true)
  })

  it('returns false for 1–2 character names (not registerable)', () => {
    expect(determinePremium('a')).toBe(false)
    expect(determinePremium('ab')).toBe(false)
    expect(determinePremium('a.eth')).toBe(false)
    expect(determinePremium('ab.eth')).toBe(false)
  })

  it('returns false for 5+ character names', () => {
    expect(determinePremium('hello')).toBe(false)
    expect(determinePremium('hello.eth')).toBe(false)
    expect(determinePremium('verylongname')).toBe(false)
  })

  it('normalizes input: trims whitespace and lowercases', () => {
    expect(determinePremium('  abc  ')).toBe(true)
    expect(determinePremium('ABC')).toBe(true)
    expect(determinePremium('  TEST.ETH  ')).toBe(true)
  })
})

describe('getPremiumLabel', () => {
  it('returns premium-3 label for 3-character names', () => {
    expect(getPremiumLabel('abc')).toEqual({
      label: '3 character premium name',
      variant: 'premium-3',
    })
    expect(getPremiumLabel('abc.eth')).toEqual({
      label: '3 character premium name',
      variant: 'premium-3',
    })
  })

  it('returns premium-4 label for 4-character names', () => {
    expect(getPremiumLabel('abcd')).toEqual({
      label: '4 character premium name',
      variant: 'premium-4',
    })
    expect(getPremiumLabel('test.eth')).toEqual({
      label: '4 character premium name',
      variant: 'premium-4',
    })
  })

  it('returns undefined for non-premium names', () => {
    expect(getPremiumLabel('a')).toBeUndefined()
    expect(getPremiumLabel('ab')).toBeUndefined()
    expect(getPremiumLabel('hello')).toBeUndefined()
    expect(getPremiumLabel('verylongname.eth')).toBeUndefined()
  })

  it('handles names with dots (extracts label before last dot)', () => {
    expect(getPremiumLabel('ab.c.eth')).toEqual({
      label: '4 character premium name',
      variant: 'premium-4',
    })
  })
})

describe('validateNameLength', () => {
  it('returns error for 1–2 character names', () => {
    expect(validateNameLength('a')).toBe(
      'Names must be 3 characters or more to register.',
    )
    expect(validateNameLength('ab')).toBe(
      'Names must be 3 characters or more to register.',
    )
    expect(validateNameLength('a.eth')).toBe(
      'Names must be 3 characters or more to register.',
    )
    expect(validateNameLength('ab.eth')).toBe(
      'Names must be 3 characters or more to register.',
    )
  })

  it('returns null for valid 3+ character names', () => {
    expect(validateNameLength('abc')).toBeNull()
    expect(validateNameLength('abcd')).toBeNull()
    expect(validateNameLength('cet.eth')).toBeNull()
    expect(validateNameLength('hello.eth')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(validateNameLength('')).toBeNull()
  })
})
