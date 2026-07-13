import type { DomainFragment } from '@ens-apps/indexer'
import { describe, expect, it } from 'vitest'
import { applyV2RoleAssignments } from './v2NameRoles'

const makeDomain = (overrides: Partial<DomainFragment> = {}): DomainFragment =>
  ({
    __typename: 'Domain',
    id: overrides.id ?? '0x1',
    name: overrides.name ?? 'alaska.eth',
    normalizedName: overrides.normalizedName ?? overrides.name ?? 'alaska.eth',
    tokenId: overrides.tokenId ?? null,
    createdAt: overrides.createdAt ?? 0,
    expiryDate: overrides.expiryDate ?? null,
    owner: overrides.owner ?? {
      __typename: 'Account',
      id: '0xowner',
    },
    resolver: overrides.resolver ?? null,
  }) as DomainFragment

describe('applyV2RoleAssignments', () => {
  it('adds manager to owned V2 domains with a non-zero role bitmap', () => {
    const [domain] = applyV2RoleAssignments(
      [makeDomain()],
      [{ name: 'alaska.eth', roleBitmap: '1' }],
    )

    expect(domain?.nameRoles).toEqual(['owner', 'manager'])
  })

  it('keeps only owner when a V2 domain has no roles for the address', () => {
    const [domain] = applyV2RoleAssignments([makeDomain()], [])

    expect(domain?.nameRoles).toEqual(['owner'])
  })

  it('matches role assignments against normalized domain names', () => {
    const [domain] = applyV2RoleAssignments(
      [makeDomain({ name: 'Alaska.eth', normalizedName: 'alaska.eth' })],
      [{ name: 'alaska.eth', roleBitmap: '0x2' }],
    )

    expect(domain?.nameRoles).toEqual(['owner', 'manager'])
  })

  it('ignores invalid role bitmaps', () => {
    const [domain] = applyV2RoleAssignments(
      [makeDomain()],
      [{ name: 'alaska.eth', roleBitmap: 'not-a-number' }],
    )

    expect(domain?.nameRoles).toEqual(['owner'])
  })
})
