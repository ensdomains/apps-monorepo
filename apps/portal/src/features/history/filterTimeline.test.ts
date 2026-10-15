import { describe, expect, it } from 'vitest'
import { buildEventTypeGroups, dateRangeToTimestamps } from './filterTimeline'

const localSeconds = (
  ...args: [number, number, number, number?, number?, number?]
) => Math.floor(new Date(...args).getTime() / 1000)

describe('dateRangeToTimestamps', () => {
  it('returns no bounds for an empty range', () => {
    expect(dateRangeToTimestamps({})).toEqual({})
  })

  it('anchors `from` at the start of its day in the local time zone', () => {
    expect(dateRangeToTimestamps({ from: new Date(2024, 2, 15) })).toEqual({
      from: localSeconds(2024, 2, 15),
    })
  })

  it('extends `to` to the last second of its day so the day is included', () => {
    expect(dateRangeToTimestamps({ to: new Date(2024, 2, 15) })).toEqual({
      to: localSeconds(2024, 2, 15, 23, 59, 59),
    })
  })

  it('covers a whole single-day range', () => {
    expect(
      dateRangeToTimestamps({
        from: new Date(2024, 2, 15),
        to: new Date(2024, 2, 15),
      }),
    ).toEqual({
      from: localSeconds(2024, 2, 15),
      to: localSeconds(2024, 2, 15, 23, 59, 59),
    })
  })
})

describe('buildEventTypeGroups', () => {
  it('returns one sorted, de-duplicated group of the types present', () => {
    const groups = buildEventTypeGroups([
      'TextChanged',
      'AddrChanged',
      'TextChanged',
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].options.map((o) => o.value)).toEqual([
      'AddrChanged',
      'TextChanged',
    ])
  })

  it('omits types the timeline never renders', () => {
    expect(buildEventTypeGroups(['CommitmentMade'])).toEqual([])
  })

  it('returns no group when there is nothing to filter by', () => {
    expect(buildEventTypeGroups([])).toEqual([])
  })
})
