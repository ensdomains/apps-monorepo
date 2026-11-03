import { describe, expect, it } from 'vitest'
import { formatGraceEndDateTime } from './formatGraceEndDateTime'

describe('formatGraceEndDateTime', () => {
  it.each([
    {
      date: '2026-10-30T01:37:42Z',
      locale: 'en-GB',
      timeZone: 'UTC',
      expected: '30 October 2026 at 01:37:42 UTC+00:00',
    },
    {
      date: '2026-10-30T01:37:42Z',
      locale: 'en-US',
      timeZone: 'America/Los_Angeles',
      expected: 'October 29, 2026 at 18:37:42 UTC-07:00',
    },
    {
      date: '2026-10-30T01:37:42Z',
      locale: 'en-GB',
      timeZone: 'Asia/Kolkata',
      expected: '30 October 2026 at 07:07:42 UTC+05:30',
    },
    {
      date: '2026-11-01T05:37:42Z',
      locale: 'en-US',
      timeZone: 'America/New_York',
      expected: 'November 1, 2026 at 01:37:42 UTC-04:00',
    },
    {
      date: '2026-11-01T06:37:42Z',
      locale: 'en-US',
      timeZone: 'America/New_York',
      expected: 'November 1, 2026 at 01:37:42 UTC-05:00',
    },
  ])(
    'shows $date in $locale, $timeZone with seconds and the UTC offset',
    (testCase) => {
      expect(
        formatGraceEndDateTime({
          date: new Date(testCase.date),
          locale: testCase.locale,
          timeZone: testCase.timeZone,
        }),
      ).toBe(testCase.expected)
    },
  )

  it.each([null, undefined, new Date(Number.NaN)])(
    'preserves the missing-date fallback for %s',
    (date) => {
      expect(
        formatGraceEndDateTime({
          date,
          locale: 'en',
          timeZone: 'UTC',
        }),
      ).toBe('—')
    },
  )
})
