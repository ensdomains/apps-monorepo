import { describe, expect, it } from 'vitest'
import { dropClippedBoundary } from './dropClippedBoundary'
import type { TimelineIndexerEvent } from './hooks/useNameHistoryTimeline'

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
  it('passes a short response through untouched', () => {
    const events = [event('a', 'TextChanged', 3), event('b', 'AddrChanged', 2)]
    expect(dropClippedBoundary(events, 10)).toEqual(events)
  })

  it('drops every transaction sharing the boundary timestamp, not just the last', () => {
    // One block (t=1) holding two interleaved transactions, both clipped by the
    // limit — the regression: `0xb` used to survive and read as complete.
    const events = [
      event('a', 'TextChanged', 2),
      event('a', 'AddrChanged', 2),
      event('b', 'NameRegistered', 1),
      event('c', 'TextChanged', 1),
      event('b', 'AddrChanged', 1),
      event('c', 'AddrChanged', 1),
    ]
    const kept = dropClippedBoundary(events, events.length)
    expect(hashes(kept)).toEqual(['0xa'])
  })

  it('keeps transactions above the boundary whole', () => {
    const events = [
      event('a', 'TextChanged', 3),
      event('b', 'AddrChanged', 2),
      event('b', 'TextChanged', 2),
      event('c', 'NameRegistered', 1),
    ]
    const kept = dropClippedBoundary(events, events.length)
    expect(hashes(kept)).toEqual(['0xa', '0xb'])
    expect(kept).toHaveLength(3)
  })

  it('returns the events untrimmed when the boundary is all there is', () => {
    const events = [
      event('a', 'TextChanged', 1),
      event('a', 'AddrChanged', 1),
      event('b', 'AddrChanged', 1),
    ]
    expect(dropClippedBoundary(events, events.length)).toEqual(events)
  })
})
