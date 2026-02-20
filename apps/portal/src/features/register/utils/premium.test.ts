import { describe, expect, it } from 'vitest'
import { determinePremium, getPremiumLabel } from './premium'

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

  it('normalizes input via ens_normalize (case)', () => {
    expect(determinePremium('ABC')).toBe(true)
    expect(determinePremium('TEST.eth')).toBe(true)
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

  it('uses first label only - ab.c.eth has first label "ab" (2 chars)', () => {
    expect(getPremiumLabel('ab.c.eth')).toBeUndefined()
  })
})
