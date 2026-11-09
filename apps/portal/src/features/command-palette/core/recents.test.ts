import { describe, expect, it } from 'vitest'
import {
  getRecentEntities,
  parseRecentEntities,
  type RecentEntity,
  recordRecentEntity,
  serializeRecentEntities,
} from './recents'

const NOW = 1_800_000_000_000
const WALLET = '0x0000000000000000000000000000000000000001'
const OTHER_WALLET = '0x0000000000000000000000000000000000000002'
const recent = (
  name: string,
  overrides: Partial<RecentEntity> = {},
): RecentEntity => ({
  entity: { type: 'name', name },
  chainId: 1,
  visitedAt: NOW - 1000,
  ...overrides,
})

describe('recent entities', () => {
  it('reads valid entries without losing all history to one malformed row', () => {
    const entry = recent('alice.eth')
    const raw = JSON.stringify({
      version: 1,
      items: [
        entry,
        {
          entity: { type: 'name', name: 'a b.eth' },
          chainId: 1,
          visitedAt: NOW,
        },
      ],
    })
    expect(parseRecentEntities(raw)).toEqual([entry])
  })

  it.each([
    null,
    '',
    '{bad json',
    '{"version":2,"items":[]}',
    '{"version":1,"items":"alice.eth"}',
  ])('ignores unavailable or incompatible storage: %s', (raw) => {
    expect(parseRecentEntities(raw)).toEqual([])
  })

  it('revisiting a name moves it ahead of other entries without mutating its earlier visit', () => {
    const first = recent('alice.eth')
    const second = recent('bob.eth', { visitedAt: NOW - 100 })
    const result = recordRecentEntity({
      entries: [first, second],
      entity: first.entity,
      chainId: 1,
      now: NOW,
    })
    expect(result).toEqual([
      { ...first, visitedAt: NOW, walletAddress: undefined },
      second,
    ])
    expect(first.visitedAt).toBe(NOW - 1000)
    expect(parseRecentEntities(serializeRecentEntities(result))).toEqual(result)
  })

  it('isolates chains and personal history while deduplicating public and personal visits', () => {
    const entries = [
      recent('public.eth'),
      recent('personal.eth', { walletAddress: WALLET }),
      recent('other.eth', { walletAddress: OTHER_WALLET }),
      recent('chain.eth', { chainId: 11155111 }),
      recent('public.eth', { walletAddress: WALLET, visitedAt: NOW - 100 }),
    ]
    expect(
      getRecentEntities({
        entries,
        chainId: 1,
        walletAddress: WALLET,
        now: NOW,
      }).map(({ entity }) => entity),
    ).toEqual([
      { type: 'name', name: 'public.eth' },
      { type: 'name', name: 'personal.eth' },
    ])
    expect(
      getRecentEntities({ entries, chainId: 1, now: NOW }).map(
        ({ entity }) => entity,
      ),
    ).toEqual([{ type: 'name', name: 'public.eth' }])
  })

  it('prunes old/future visits and leaves the current entity out of the visible list', () => {
    const entries = [
      recent('current.eth'),
      recent('old.eth', { visitedAt: 0 }),
      recent('future.eth', { visitedAt: NOW + 1 }),
      recent('useful.eth'),
    ]
    expect(
      getRecentEntities({
        entries,
        chainId: 1,
        now: NOW,
        exclude: { type: 'name', name: 'current.eth' },
      }),
    ).toEqual([recent('useful.eth')])
  })

  it('bounds stored history while preserving the newest navigation', () => {
    const entries = Array.from({ length: 100 }, (_, index) =>
      recent(`name${index}.eth`, { visitedAt: NOW - index - 1 }),
    )
    const result = recordRecentEntity({
      entries,
      entity: { type: 'name', name: 'new.eth' },
      chainId: 1,
      now: NOW,
    })
    expect(result).toHaveLength(60)
    expect(result.at(0)?.entity).toEqual({ type: 'name', name: 'new.eth' })
    expect(result.at(-1)?.entity).toEqual({ type: 'name', name: 'name58.eth' })
  })
})
