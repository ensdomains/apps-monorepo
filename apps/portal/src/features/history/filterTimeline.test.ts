import { describe, expect, it } from 'vitest'
import { buildEventTypeGroups, dateRangeToTimestamps } from './filterTimeline'
import type { TimelineIndexerEvent } from './timelineEvent'

const event = (type: string, id: string): TimelineIndexerEvent => ({
  id,
  type,
  transactionHash: `0x${id}` as const,
  blockNumber: 1,
  timestamp: 1,
})

const utcSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000)

describe('dateRangeToTimestamps', () => {
  it('returns no bounds for an empty range', () => {
    expect(dateRangeToTimestamps({})).toEqual({})
  })

  it('anchors `from` at the start of its day in UTC', () => {
    // The picker hands back a local-midnight Date; the bound has to land on the
    // same calendar day in UTC, because that is how the timeline dates events.
    expect(dateRangeToTimestamps({ from: new Date(2024, 2, 15) })).toEqual({
      from: utcSeconds('2024-03-15T00:00:00Z'),
    })
  })

  it('extends `to` to the last second of its day so the day is included', () => {
    expect(dateRangeToTimestamps({ to: new Date(2024, 2, 15) })).toEqual({
      to: utcSeconds('2024-03-15T23:59:59Z'),
    })
  })

  it('covers a whole single-day range', () => {
    expect(
      dateRangeToTimestamps({
        from: new Date(2024, 2, 15),
        to: new Date(2024, 2, 15),
      }),
    ).toEqual({
      from: utcSeconds('2024-03-15T00:00:00Z'),
      to: utcSeconds('2024-03-15T23:59:59Z'),
    })
  })
})

describe('buildEventTypeGroups', () => {
  it('returns one sorted, de-duplicated group of the types present', () => {
    const groups = buildEventTypeGroups([
      event('TextChanged', '1'),
      event('AddrChanged', '2'),
      event('TextChanged', '3'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].options.map((o) => o.value)).toEqual([
      'AddrChanged',
      'TextChanged',
    ])
  })

  it('omits types the timeline never renders', () => {
    expect(buildEventTypeGroups([event('CommitmentMade', '1')])).toEqual([])
  })

  it('returns no group when there is nothing to filter by', () => {
    expect(buildEventTypeGroups([])).toEqual([])
  })
})
