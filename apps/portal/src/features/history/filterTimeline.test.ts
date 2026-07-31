import type { Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import { filterActions } from './filterTimeline'
import type { TimelineIndexerEvent } from './hooks/useNameHistoryTimeline'
import type { Action } from './summarize/summarize.types'

const event = (type: string, id: string): TimelineIndexerEvent =>
  ({
    id,
    type,
    transactionHash: '0xabc' as Hex,
    blockNumber: 1,
    timestamp: 1_700_000_000,
  }) as TimelineIndexerEvent

const action = (events: TimelineIndexerEvent[]): Action => ({
  txHash: '0xabc' as Hex,
  icon: 'default',
  label: 'Test',
  slots: [],
  timestamp: 1_700_000_000,
  events,
})

describe('filterActions', () => {
  it('keeps only selected event types inside a multi-event action', () => {
    const filtered = filterActions(
      [
        action([
          event('NameRegistered', '1'),
          event('Transfer', '2'),
          event('EACRolesChanged', '3'),
        ]),
      ],
      {},
      ['Transfer'],
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0].events.map((e) => e.type)).toEqual(['Transfer'])
  })

  it('drops actions with no matching event types', () => {
    const filtered = filterActions(
      [action([event('NameRegistered', '1')])],
      {},
      ['Transfer'],
    )
    expect(filtered).toEqual([])
  })
})
