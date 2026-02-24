import { describe, expect, it } from 'vitest'
import { validateNameLength } from './nameValidation'

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

  it('returns error for invalid names (empty, unparseable)', () => {
    expect(validateNameLength('')).toBe('Invalid name')
  })
})
