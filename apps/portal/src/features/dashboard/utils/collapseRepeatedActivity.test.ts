import { describe, expect, it } from 'vitest'
import type { RecentActivityEvent } from '../hooks/useRecentActivity'
import { collapseRepeatedActivity } from './collapseRepeatedActivity'

const event = (
  over: Partial<Pick<RecentActivityEvent, 'name' | 'transactionHash'>> & {
    readonly type: 'renewal' | 'expiry' | 'record'
    readonly key?: string
  },
): RecentActivityEvent => ({
  name: over.name ?? 'alice.eth',
  transactionHash: over.transactionHash ?? '0x01',
  timestamp: 0,
  blockNumber: 0,
  contractAddress: '0x02',
  ...(over.type === 'record'
    ? { type: 'record', data: { key: over.key ?? 'text:url' } }
    : { type: over.type, data: {} }),
})

const renewal = event({ type: 'renewal' })
const expiry = event({ type: 'expiry' })
const url = event({ type: 'record', key: 'text:url' })
const avatar = event({ type: 'record', key: 'text:avatar' })
const urlLater = event({
  type: 'record',
  key: 'text:url',
  transactionHash: '0x03',
})
const bobRenewal = event({ type: 'renewal', name: 'bob.eth' })

describe('collapseRepeatedActivity', () => {
  it.each<{
    readonly label: string
    readonly events: readonly RecentActivityEvent[]
    readonly expected: readonly RecentActivityEvent[]
  }>([
    {
      label: "bigname's ENSv1 + ENSv2 renewal fan-out",
      events: [
        renewal,
        { ...renewal },
        expiry,
        { ...renewal },
        { ...expiry },
        { ...renewal },
        { ...expiry },
        { ...expiry },
      ],
      expected: [renewal, expiry],
    },
    {
      label: "Goldsky's two renewals",
      events: [renewal, { ...renewal }],
      expected: [renewal],
    },
    {
      label: 'two text keys in one transaction',
      events: [url, avatar],
      expected: [url, avatar],
    },
    {
      label: 'the same text key in two transactions',
      events: [url, urlLater],
      expected: [url, urlLater],
    },
    {
      label: 'one kind for two names in one transaction',
      events: [renewal, bobRenewal],
      expected: [renewal, bobRenewal],
    },
    {
      label: 'repeats interleaved with other rows, in feed order',
      events: [urlLater, renewal, avatar, { ...renewal }, bobRenewal],
      expected: [urlLater, renewal, avatar, bobRenewal],
    },
  ])('$label', ({ events, expected }) => {
    // By position in the input, so a kept copy can't pass for the first.
    const positions = (rows: readonly RecentActivityEvent[]) =>
      rows.map((row) => events.indexOf(row))
    expect(positions(collapseRepeatedActivity(events))).toEqual(
      positions(expected),
    )
  })
})
