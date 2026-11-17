import { getAddress, namehash } from 'viem'
import { describe, expect, it } from 'vitest'
import type { HistoryEvent } from '../reads/history.types'
import {
  isWithinHistoryFilter,
  toEventsWhere,
  toEventWhere,
  toHistoryStart,
} from './historyFilters'

const NODE = namehash('afasf.eth')
const REGISTERED_AT = new Date('2026-11-17T10:36:24Z')
const ANCHOR = { namehash: NODE, registeredAt: REGISTERED_AT }
const RESOLVER = '0x5fea82d96b8dd71e33138c6cba615f8bcf088d3a'

const seconds = (date: Date) => Math.floor(date.getTime() / 1000)

describe('toEventsWhere', () => {
  it('keeps the later of the registration and the requested start', () => {
    const later = new Date('2026-12-01T00:00:00Z')

    expect(
      toEventsWhere({ registrationId: '0x1', from: later }, ANCHOR),
    ).toMatchObject({ namehash: NODE, timestamp_gte: seconds(later) })
    expect(
      toEventsWhere(
        { registrationId: '0x1', from: new Date('2020-01-01T00:00:00Z') },
        ANCHOR,
      ),
    ).toMatchObject({ timestamp_gte: seconds(REGISTERED_AT) })
  })

  it.each([
    {
      case: 'a registration id no name holds',
      query: { registrationId: '0x1' },
      anchor: null,
    },
    {
      case: 'a name other than the registration’s',
      query: { registrationId: '0x1', name: 'other.eth' },
      anchor: ANCHOR,
    },
    {
      case: 'a resolver and a different contract',
      query: {
        resolver: RESOLVER,
        contractAddress: '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4',
      },
      anchor: null,
    },
  ] as const)('reads nothing for $case', ({ query, anchor }) => {
    expect(toEventsWhere(query, anchor)).toBeNull()
  })

  it('accepts a resolver given as the contract too', () => {
    expect(
      toEventsWhere(
        {
          resolver: RESOLVER,
          contractAddress: getAddress(RESOLVER),
        },
        null,
      ),
    ).toEqual({ contractAddress: RESOLVER })
  })
})

describe('toHistoryStart', () => {
  const before = new Date('2020-01-01T00:00:00Z')

  it.each([
    { scope: 'registration', from: before, start: REGISTERED_AT },
    { scope: 'registration', from: undefined, start: REGISTERED_AT },
    { scope: 'both', from: before, start: before },
  ] as const)(
    'starts a $scope history from $start',
    ({ scope, from, start }) => {
      expect(toHistoryStart({ scope, from }, REGISTERED_AT)).toEqual(start)
    },
  )
})

describe('isWithinHistoryFilter', () => {
  const registration = (timestamp: Date | null) =>
    ({
      id: '11155111-3970144-60',
      name: 'test.eth',
      registrationId: null,
      blockNumber: 3970144,
      timestamp,
      transactionHash: '0x01',
      logIndex: 60,
      contractAddress: null,
      kind: 'NameRegistered',
      type: 'registration',
      data: {},
    }) satisfies HistoryEvent

  it.each([
    {
      case: 'a type it excludes',
      filter: { types: ['transfer'] as const },
      timestamp: REGISTERED_AT,
      kept: false,
    },
    {
      case: 'a time before the window',
      filter: { from: new Date('2027-01-01T00:00:00Z') },
      timestamp: REGISTERED_AT,
      kept: false,
    },
    {
      case: 'no timestamp inside a window',
      filter: { from: new Date('2020-01-01T00:00:00Z') },
      timestamp: null,
      kept: false,
    },
    {
      case: 'no timestamp and no window',
      filter: {},
      timestamp: null,
      kept: true,
    },
    {
      case: 'a matching type and time',
      filter: {
        types: ['registration'] as const,
        to: new Date('2027-01-01T00:00:00Z'),
      },
      timestamp: REGISTERED_AT,
      kept: true,
    },
  ])('keeps $case: $kept', ({ filter, timestamp, kept }) => {
    expect(isWithinHistoryFilter(filter)(registration(timestamp))).toBe(kept)
  })
})

describe('toEventWhere kinds', () => {
  it('reads every kind asked for, not only root role changes', () => {
    expect(
      toEventWhere({ kinds: ['RootPermissionChanged', 'LabelRegistered'] }),
    ).toEqual({ type_in: ['LabelRegistered', 'EACRolesChanged'] })
  })

  it('narrows to the root resource when only root role changes are asked for', () => {
    expect(toEventWhere({ kinds: ['RootPermissionChanged'] })).toEqual({
      type_in: ['EACRolesChanged'],
      resource: '0x0',
    })
  })

  it('reads a bigname kind from the zigens types that produce it', () => {
    expect(toEventWhere({ kinds: ['ResolverChanged'] })).toEqual({
      type_in: ['ResolverUpdated'],
    })
  })

  it('matches nothing when the types and kinds exclude each other', () => {
    expect(
      toEventWhere({ types: ['transfer'], kinds: ['ResolverChanged'] }),
    ).toBeNull()
  })
})
