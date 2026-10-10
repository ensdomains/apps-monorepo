import { describe, expect, it } from 'vitest'
import { dropClippedBoundary } from './dropClippedBoundary'
import type { TimelineEvent } from './timelineEvent'

const event = (tx: string, id: string, timestamp: number): TimelineEvent => ({
  id: `${tx}-${id}`,
  type: 'record',
  name: 'alice.eth',
  registrationId: null,
  transactionHash: `0x${tx}`,
  blockNumber: timestamp,
  logIndex: 0,
  timestamp,
  data: {},
})

const hashes = (events: readonly TimelineEvent[]) => [
  ...new Set(events.map((e) => e.transactionHash)),
]

describe('dropClippedBoundary', () => {
  it('keeps everything when the read reached the end of the feed', () => {
    const events = [event('a', '1', 2), event('b', '1', 1)]
    expect(dropClippedBoundary(events, false)).toEqual(events)
  })

  it('drops every transaction in the boundary group, not just the last', () => {
    // One block (t=1) holding two transactions, either of which may continue
    // onto the next page. Dropping only `0xc` would leave `0xb` looking complete.
    const events = [
      event('a', '1', 2),
      event('a', '2', 2),
      event('b', '1', 1),
      event('b', '2', 1),
      event('c', '1', 1),
    ]
    expect(hashes(dropClippedBoundary(events, true))).toEqual(['0xa'])
  })

  it('keeps transactions above the boundary whole', () => {
    const events = [
      event('a', '1', 3),
      event('b', '1', 2),
      event('b', '2', 2),
      event('c', '1', 1),
    ]
    const kept = dropClippedBoundary(events, true)
    expect(hashes(kept)).toEqual(['0xa', '0xb'])
    expect(kept).toHaveLength(3)
  })

  it('empties a page that is a single unfinished group', () => {
    const events = [event('a', '1', 1), event('b', '1', 1)]
    expect(dropClippedBoundary(events, true)).toEqual([])
  })
})
