import { describe, expect, it } from 'vitest'
import { parseExpiryWithinDays } from './jevNameSearchTime'

const now = new Date('2026-09-25T12:00:00.000Z')

describe('Jev name search time parsing', () => {
  it.each([
    ['expiring within 45 days', 45],
    ['expiring in the next 123 days', 123],
    ['expiring in a week', 7],
    ['expires in two weeks', 14],
    ['expires in 24 hours', 1],
    ['expires in the next 48 hours', 2],
  ])('converts relative time in %s to days', (query, expected) => {
    expect(parseExpiryWithinDays(query, now)).toBe(expected)
  })

  it('leaves vague expiry wording to the default window', () => {
    expect(parseExpiryWithinDays('expiring soon', now)).toBeNull()
  })

  it.each([
    'expired 45 days ago',
    'within 0 days',
    'expiring this month',
    'expires before Friday',
    'expires tomorrow',
  ])('rejects unsupported or non-future time in %s', (query) => {
    expect(parseExpiryWithinDays(query, now)).toBe('invalid')
  })
})
