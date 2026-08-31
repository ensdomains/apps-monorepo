import { describe, expect, it } from 'vitest'
import {
  type TimelineIndexerEvent,
  V1_PROTOCOL,
} from './hooks/useNameHistoryTimeline'
import { mergeTimeline } from './mergeTimeline'

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
  mergeTimeline({
    v2Events: [],
    v1Events: [],
    first: 10,
    orderDirection: 'desc',
    eventsCount: 0,
    ...params,
  })

describe('mergeTimeline', () => {
  it('interleaves both protocols newest-first', () => {
    const result = merge({
      v2Events: [event('c', 'TextChanged', 3)],
      v1Events: [
        v1Event('a', 'NameRegistered', 1),
        v1Event('b', 'Transfer', 2),
      ],
      eventsCount: 1,
    })

    expect(result.events.map((e) => e.transactionHash)).toEqual([
      '0xc',
      '0xb',
      '0xa',
    ])
  })

  describe('asc', () => {
    it('keeps the oldest transactions and still returns them newest-first', () => {
      // A desc merge truncated from the tail would keep 0xd/0xc — exactly the
      // opposite of what an ascending caller asked for.
      const result = merge({
        v2Events: [
          event('a', 'NameRegistered', 1),
          event('b', 'AddrChanged', 2),
          event('c', 'TextChanged', 3),
          event('d', 'TextChanged', 4),
        ],
        first: 2,
        orderDirection: 'asc',
        eventsCount: 4,
      })

      expect(result.events.map((e) => e.transactionHash)).toEqual([
        '0xb',
        '0xa',
      ])
    })

    it('does not split a transaction at the oldest end', () => {
      const result = merge({
        v2Events: [
          event('a', 'NameRegistered', 1),
          event('a', 'AddrChanged', 1),
          event('b', 'TextChanged', 2),
        ],
        first: 2,
        orderDirection: 'asc',
        eventsCount: 3,
      })

      expect(result.events.map((e) => e.transactionHash)).toEqual([
        '0xa',
        '0xa',
      ])
    })
  })

  describe('hasMore', () => {
    it('is false when the window holds the name entirely', () => {
      expect(
        merge({
          v2Events: [event('a', 'NameRegistered', 1)],
          first: 10,
          eventsCount: 1,
        }).hasMore,
      ).toBe(false)
    })

    it('is true on a saturated window even when nothing was truncated', () => {
      // The merge exactly fills `first`, so `events.length` alone reads as a
      // complete history — the signal callers cannot derive themselves.
      const result = merge({
        v2Events: [event('a', 'TextChanged', 2), event('b', 'TextChanged', 1)],
        first: 2,
        eventsCount: 40,
      })

      expect(result.events).toHaveLength(2)
      expect(result.hasMore).toBe(true)
    })

    it('is true when truncation dropped a transaction', () => {
      const result = merge({
        v2Events: [
          event('a', 'TextChanged', 3),
          event('b', 'TextChanged', 2),
          event('b', 'AddrChanged', 2),
        ],
        first: 2,
        eventsCount: 3,
      })

      expect(result.events).toHaveLength(1)
      expect(result.hasMore).toBe(true)
    })
  })

  describe('a v1-only name', () => {
    it('reports v1 history so callers can hide the v2-only count', () => {
      const result = merge({
        v2Events: [],
        v1Events: [
          v1Event('a', 'NameRegistered', 1),
          v1Event('b', 'Transfer', 2),
        ],
        eventsCount: 0,
      })

      expect(result.events).toHaveLength(2)
      expect(result.hasV1History).toBe(true)
      // The v2 indexer has no `domains` row for the name at all.
      expect(result.totalCount).toBe(0)
    })
  })

  it('leaves hasV1History false for a v2-only name', () => {
    expect(
      merge({ v2Events: [event('a', 'LabelRegistered', 1)], eventsCount: 1 })
        .hasV1History,
    ).toBe(false)
  })
})
