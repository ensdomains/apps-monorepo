import { describe, expect, it } from 'vitest'
import { getProgressFraction } from './getProgressFraction'

describe('getProgressFraction', () => {
  it('shows no fill before any transaction starts', () => {
    expect(getProgressFraction([])).toBe(0)
    expect(getProgressFraction([undefined, undefined])).toBe(0)
    expect(
      getProgressFraction([undefined, undefined, undefined, undefined]),
    ).toBe(0)
  })

  it.each([
    { statuses: ['pending', undefined, undefined, undefined], expected: 0.125 },
    { statuses: ['success', undefined, undefined, undefined], expected: 0.125 },
    { statuses: ['success', 'pending', undefined, undefined], expected: 0.375 },
    { statuses: ['success', 'success', undefined, undefined], expected: 0.375 },
    { statuses: ['success', 'success', 'pending', undefined], expected: 0.625 },
    { statuses: ['success', 'success', 'success', undefined], expected: 0.625 },
    { statuses: ['success', 'success', 'success', 'pending'], expected: 0.875 },
    { statuses: ['success', 'success', 'success', 'success'], expected: 1 },
  ] as const)(
    'keeps registration $statuses at $expected',
    ({ statuses, expected }) => {
      expect(getProgressFraction(statuses)).toBe(expected)
    },
  )

  it.each([
    { statuses: ['pending', undefined], expected: 0.25 },
    { statuses: ['success', undefined], expected: 0.25 },
    { statuses: ['success', 'pending'], expected: 0.75 },
    { statuses: ['success', 'success'], expected: 1 },
  ] as const)(
    'keeps renewal $statuses at $expected',
    ({ statuses, expected }) => {
      expect(getProgressFraction(statuses)).toBe(expected)
    },
  )

  it('keeps failed and retrying steps at their gap instead of an icon', () => {
    expect(getProgressFraction(['error', undefined])).toBe(0.25)
    expect(getProgressFraction(['success', 'error'])).toBe(0.75)
    expect(getProgressFraction(['success', 'retrying'])).toBe(0.75)
  })

  it('only fills a one-transaction flow completely after success', () => {
    expect(getProgressFraction([undefined])).toBe(0)
    expect(getProgressFraction(['pending'])).toBe(0.5)
    expect(getProgressFraction(['success'])).toBe(1)
  })
})
