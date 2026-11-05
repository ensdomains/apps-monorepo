import { describe, expect, it } from 'vitest'
import { formatGraceEndDateTime } from './formatGraceEndDateTime'

describe('formatGraceEndDateTime', () => {
  it.each([
    {
      locale: 'en-GB',
      timeZone: 'UTC',
      expected: '30 October 2026 at 01:37 UTC+00:00',
    },
    {
      locale: 'en-US',
      timeZone: 'America/Los_Angeles',
      expected: 'October 29, 2026 at 18:37 UTC-07:00',
    },
  ])('shows the deadline in $locale, $timeZone without seconds', (testCase) => {
    expect(
      formatGraceEndDateTime({
        date: new Date('2026-10-30T01:37:42Z'),
        locale: testCase.locale,
        timeZone: testCase.timeZone,
      }),
    ).toBe(testCase.expected)
  })

  it('preserves the missing-date fallback for an invalid deadline', () => {
    expect(
      formatGraceEndDateTime({
        date: new Date(Number.NaN),
        locale: 'en',
        timeZone: 'UTC',
      }),
    ).toBe('—')
  })
})
