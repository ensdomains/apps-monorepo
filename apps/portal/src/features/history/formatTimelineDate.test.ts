import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTimelineDate, formatTimelineTime } from './formatTimelineDate'

const utcSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000)

describe('formatTimelineDate / formatTimelineTime', () => {
  beforeEach(() => {
    vi.spyOn(Temporal.Now, 'timeZoneId').mockReturnValue('America/New_York')
    vi.spyOn(Temporal.Now, 'plainDateISO').mockReturnValue(
      Temporal.PlainDate.from('2026-10-13'),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the time of day in the viewer’s time zone', () => {
    expect(formatTimelineTime(utcSeconds('2026-10-13T14:51:00Z'))).toBe(
      '10:51 AM',
    )
  })

  it('groups by the viewer’s calendar day, not the UTC day', () => {
    expect(formatTimelineDate(utcSeconds('2026-10-14T02:00:00Z'))).toBe('Today')
    expect(formatTimelineDate(utcSeconds('2026-10-13T02:00:00Z'))).toBe(
      'Yesterday',
    )
  })
})
