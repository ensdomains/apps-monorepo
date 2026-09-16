import { describe, expect, it } from 'vitest'
import { mergeTimeline } from './mergeTimeline'
import { type TimelineIndexerEvent, V1_PROTOCOL } from './timelineEvent'

const event = (
  tx: string,
  type: string,
  timestamp: number,
  protocol?: string,
): TimelineIndexerEvent => ({
  id: `${tx}-${type}-${timestamp}`,
  type,
  protocol,
  transactionHash: `0x${tx}` as const,
  blockNumber: timestamp,
  timestamp,
})

const v1Event = (tx: string, type: string, timestamp: number) =>
  event(tx, type, timestamp, V1_PROTOCOL)

const merge = (params: Partial<Parameters<typeof mergeTimeline>[0]>) =>
  mergeTimeline({ pagedEvents: [], hasNextPage: false, ...params })

const ids = (events: readonly TimelineIndexerEvent[]) => events.map((e) => e.id)

describe('mergeTimeline', () => {
  it('interleaves both sources newest-first once the feed is fully loaded', () => {
    const events = merge({
      pagedEvents: [event('c', 'TextChanged', 3)],
      auxiliaryEvents: [
        v1Event('a', 'NameRegistered', 1),
        v1Event('b', 'AddrChanged', 2),
      ],
    })
    expect(events.map((e) => e.timestamp)).toEqual([3, 2, 1])
  })

  it('withholds auxiliary events older than the horizon', () => {
    // Another page is coming, so the feed is only complete down to t=5. The v1
    // registration at t=1 belongs below rows that have not been fetched — it
    // must not surface above them.
    const events = merge({
      pagedEvents: [
        event('c', 'TextChanged', 9),
        event('b', 'AddrChanged', 5),
        event('a', 'Transfer', 4),
      ],
      auxiliaryEvents: [v1Event('v1', 'NameRegistered', 1)],
      hasNextPage: true,
    })
    // `0xa` is the clipped boundary transaction, so the feed is complete only
    // down to `0xb`'s t=5 and the v1 event stays back.
    expect(ids(events)).toEqual(['c-TextChanged-9', 'b-AddrChanged-5'])
  })

  it('reveals a withheld auxiliary event once paging reaches it', () => {
    const pagedEvents = [
      event('c', 'TextChanged', 9),
      event('b', 'AddrChanged', 5),
    ]
    const auxiliaryEvents = [v1Event('v1', 'NameRegistered', 1)]

    expect(
      ids(merge({ pagedEvents, auxiliaryEvents, hasNextPage: true })),
    ).not.toContain('v1-NameRegistered-1')
    expect(
      ids(merge({ pagedEvents, auxiliaryEvents, hasNextPage: false })),
    ).toContain('v1-NameRegistered-1')
  })

  it('keeps auxiliary events that sit on the horizon', () => {
    // The horizon transaction is whole, so a v1 event sharing its timestamp
    // belongs on screen beside it rather than one page later.
    const events = merge({
      pagedEvents: [event('b', 'AddrChanged', 5), event('a', 'Transfer', 4)],
      auxiliaryEvents: [v1Event('v1', 'NewResolver', 5)],
      hasNextPage: true,
    })
    expect(ids(events)).toContain('v1-NewResolver-5')
  })

  it('withholds everything auxiliary when no paged transaction is complete', () => {
    // The whole page is one unfinished transaction, so nothing is provably
    // complete — falling through to "fully loaded" would dump the v1 history on
    // screen above history that has not been read.
    const events = merge({
      pagedEvents: [event('a', 'TextChanged', 9), event('a', 'AddrChanged', 9)],
      auxiliaryEvents: [v1Event('v1', 'NameRegistered', 1)],
      hasNextPage: true,
    })
    expect(events).toEqual([])
  })

  it('drops a v1 event whose transaction is already in the paged feed', () => {
    // The v1 subgraph indexes the same resolver writes the v2 indexer does, in
    // a different id shape — summing them rendered each record twice inside one
    // action.
    const events = merge({
      pagedEvents: [event('x', 'TextChanged', 7)],
      auxiliaryEvents: [v1Event('x', 'TextChanged', 7)],
    })
    expect(ids(events)).toEqual(['x-TextChanged-7'])
  })

  it('matches twins case-insensitively, as summarizeEvents groups them', () => {
    // Both sources emit lowercase hashes today. If one ever returned a
    // checksummed hash, a case-sensitive compare would keep the twin here and
    // then merge it into the same action row downstream — the duplicate this
    // filter exists to prevent.
    const events = merge({
      pagedEvents: [event('AbC', 'TextChanged', 7)],
      auxiliaryEvents: [v1Event('abc', 'TextChanged', 7)],
    })
    expect(ids(events)).toEqual(['AbC-TextChanged-7'])
  })

  it('drops a v1 twin of the clipped boundary transaction', () => {
    // The boundary transaction is withheld from this render, not absent from the
    // feed: keeping its v1 twin would show the row now and again a page later.
    const events = merge({
      pagedEvents: [event('b', 'AddrChanged', 5), event('a', 'Transfer', 4)],
      auxiliaryEvents: [v1Event('a', 'Transfer', 4)],
      hasNextPage: true,
    })
    expect(ids(events)).toEqual(['b-AddrChanged-5'])
  })

  it('keeps a v1 event from a transaction the paged feed does not carry', () => {
    const events = merge({
      pagedEvents: [event('x', 'TextChanged', 7)],
      auxiliaryEvents: [v1Event('y', 'NewResolver', 6)],
    })
    expect(ids(events)).toEqual(['x-TextChanged-7', 'y-NewResolver-6'])
  })

  it('drops an auxiliary event the paged feed already carries', () => {
    // A child registration can be attributed to the parent and also be in the
    // parent's own feed.
    const shared = event('x', 'LabelRegistered', 7)
    const events = merge({
      pagedEvents: [shared],
      auxiliaryEvents: [{ ...shared }],
    })
    expect(events).toHaveLength(1)
  })

  it('trims the clipped boundary transaction while more pages remain', () => {
    const events = merge({
      pagedEvents: [
        event('a', 'TextChanged', 3),
        event('b', 'AddrChanged', 2),
        event('b', 'TextChanged', 2),
      ],
      hasNextPage: true,
    })
    expect(ids(events)).toEqual(['a-TextChanged-3'])
  })
})
