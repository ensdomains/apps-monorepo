import type { NameWithRelation } from '@ensdomains/ensjs/subgraph'
import { describe, expect, it } from 'vitest'
import type { V2NameWithRoles } from '@/utils/names/mergeNamesData'
import { settleOwnedNames } from './settleOwnedNames'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 0, 1)

const v1Name = (name: string, days: number | null) =>
  ({
    name,
    parentName: name.split('.').slice(1).join('.'),
    expiryDate:
      days === null
        ? null
        : { date: new Date(NOW + days * DAY), value: NOW + days * DAY },
    relation: { owner: true },
  }) as NameWithRelation

const v2Name = (name: string, days: number | null): V2NameWithRoles => ({
  name,
  expiryDate: days === null ? null : (NOW + days * DAY) / 1000,
  roleBitmap: '0',
  subdomainCount: 0,
})

const settle = (
  v1: readonly NameWithRelation[],
  v2: readonly V2NameWithRoles[],
  { hasMoreV1 = false, hasMoreV2 = false } = {},
) =>
  settleOwnedNames({
    v1: { names: v1, hasMore: hasMoreV1 },
    v2: { names: v2, hasMore: hasMoreV2 },
  }).map(({ name }) => name)

describe('settleOwnedNames', () => {
  it('merges everything by expiry, no expiry last, once both sources have ended', () => {
    expect(
      settle(
        [v1Name('b.eth', 20), v1Name('sub.b.eth', null)],
        [v2Name('a.eth', 10), v2Name('c.eth', 30), v2Name('sub.a.eth', null)],
      ),
    ).toEqual(['a.eth', 'b.eth', 'c.eth', 'sub.b.eth', 'sub.a.eth'])
  })

  it('holds back ENSv2 names that unloaded ENSv1 names could precede', () => {
    expect(
      settle(
        [v1Name('a.eth', 10), v1Name('b.eth', 20)],
        [v2Name('early.eth', 15), v2Name('tied.eth', 20), v2Name('c.eth', 30)],
        { hasMoreV1: true },
      ),
    ).toEqual(['a.eth', 'early.eth', 'b.eth'])
  })

  it('holds back ENSv1 names that unloaded ENSv2 names could precede', () => {
    expect(
      settle(
        [v1Name('tied.eth', 20), v1Name('c.eth', 30), v1Name('x.c.eth', null)],
        [v2Name('a.eth', 10), v2Name('b.eth', 20)],
        { hasMoreV2: true },
      ),
    ).toEqual(['a.eth', 'tied.eth', 'b.eth'])
  })

  it('keeps ENSv1 names without an expiry once ENSv2 has reached its own', () => {
    expect(
      settle(
        [v1Name('a.eth', 10), v1Name('x.a.eth', null)],
        [v2Name('b.eth', 20), v2Name('x.b.eth', null)],
        { hasMoreV2: true },
      ),
    ).toEqual(['a.eth', 'b.eth', 'x.a.eth', 'x.b.eth'])
  })

  it('allows for .eth names being paged by the end of their grace period', () => {
    // An unloaded .eth name can expire up to 90 days before the last subname loaded.
    expect(
      settle(
        [
          v1Name('early.sub.eth', 50),
          v1Name('a.eth', 10),
          v1Name('late.sub.eth', 150),
          v1Name('b.eth', 100),
        ],
        [v2Name('c.eth', 99), v2Name('d.eth', 100)],
        { hasMoreV1: true },
      ),
    ).toEqual(['a.eth', 'early.sub.eth', 'c.eth', 'b.eth'])
  })

  it('shows nothing from the other source until a source with more has loaded a page', () => {
    expect(settle([], [v2Name('a.eth', 10)], { hasMoreV1: true })).toEqual([])
  })
})
