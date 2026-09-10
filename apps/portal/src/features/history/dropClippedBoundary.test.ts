import { describe, expect, it } from 'vitest'
import { dropClippedBoundary } from './dropClippedBoundary'
import type { TimelineIndexerEvent } from './timelineEvent'

const event = (
  tx: string,
  type: string,
  timestamp: number,
): TimelineIndexerEvent =>
  ({
    id: `${tx}-${type}-${timestamp}`,
    type,
    transactionHash: `0x${tx}` as const,
    blockNumber: timestamp,
    timestamp,
  }) as TimelineIndexerEvent

const hashes = (events: readonly TimelineIndexerEvent[]) => [
  ...new Set(events.map((e) => e.transactionHash)),
]

describe('dropClippedBoundary', () => {
  it('keeps everything when the query reached the end of the feed', () => {
    const events = [event('a', 'TextChanged', 2), event('b', 'AddrChanged', 1)]
    expect(dropClippedBoundary(events, false)).toEqual(events)
  })

  it('drops every transaction in the boundary group, not just the last', () => {
    // One block (t=1) holding two interleaved transactions, either of which may
    // continue onto the next page. Dropping only `0xc` would leave `0xb`
    // looking complete.
    const events = [
      event('a', 'TextChanged', 2),
      event('a', 'AddrChanged', 2),
      event('b', 'NameRegistered', 1),
      event('c', 'TextChanged', 1),
      event('b', 'AddrChanged', 1),
      event('c', 'AddrChanged', 1),
    ]
    expect(hashes(dropClippedBoundary(events, true))).toEqual(['0xa'])
  })

  it('keeps transactions above the boundary whole', () => {
    const events = [
      event('a', 'TextChanged', 3),
      event('b', 'AddrChanged', 2),
      event('b', 'TextChanged', 2),
      event('c', 'NameRegistered', 1),
    ]
    const kept = dropClippedBoundary(events, true)
    expect(hashes(kept)).toEqual(['0xa', '0xb'])
    expect(kept).toHaveLength(3)
  })

  it('empties a page that is a single unfinished group', () => {
    const events = [event('a', 'TextChanged', 1), event('b', 'AddrChanged', 1)]
    expect(dropClippedBoundary(events, true)).toEqual([])
  })
})
