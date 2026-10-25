import { describe, expect, it } from 'vitest'
import type { NameRow } from './columns'
import { filterNameRows } from './filterNameRows'

const row = (
  name: string | null,
  protocolVersion: NameRow['protocolVersion'],
  relations: NameRow['relations'],
): NameRow => ({
  name,
  protocolVersion,
  relations,
  graceEndDate: null,
  status: 'active',
})

const names = [
  row('owner.eth', 'ENSv1', ['owner']),
  row('manager.eth', 'ENSv1', ['manager']),
  row('both.eth', 'ENSv1', ['owner', 'manager']),
  row('sub.owner.eth', 'ENSv1', ['manager']),
  row('deep.sub.owner.eth', 'ENSv1', ['owner']),
  row('former.eth', 'ENSv1', ['former_owner']),
  row('v2.eth', 'ENSv2', ['owner', 'manager']),
  row('sub.v2.eth', 'ENSv2', ['role_holder']),
  row('example.com', 'ENSv1', ['owner']),
  row(null, 'ENSv1', []),
]

describe('filterNameRows', () => {
  it.each([
    { levels: [], relations: [], expected: names.map((row) => row.name) },
    {
      levels: ['2ld'],
      relations: [],
      expected: [
        'owner.eth',
        'manager.eth',
        'both.eth',
        'former.eth',
        'v2.eth',
        'example.com',
      ],
    },
    {
      levels: ['subname'],
      relations: [],
      expected: ['sub.owner.eth', 'deep.sub.owner.eth', 'sub.v2.eth'],
    },
    {
      levels: [],
      relations: ['owner'],
      expected: ['owner.eth', 'both.eth', 'deep.sub.owner.eth', 'example.com'],
    },
    {
      levels: ['2ld', 'subname'],
      relations: ['owner', 'manager'],
      expected: [
        'owner.eth',
        'manager.eth',
        'both.eth',
        'sub.owner.eth',
        'deep.sub.owner.eth',
        'example.com',
      ],
    },
    {
      levels: ['subname'],
      relations: ['manager'],
      expected: ['sub.owner.eth'],
    },
  ])('filters $levels and V1 $relations', ({ levels, relations, expected }) => {
    expect(
      filterNameRows(names, levels, relations).map((row) => row.name),
    ).toEqual(expected)
  })

  it.each([
    { roles: ['v2:ROLE_RENEW'], expected: ['v2.eth'] },
    { roles: ['owner', 'v2:ROLE_RENEW'], expected: ['owner.eth', 'v2.eth'] },
    { roles: ['v2:ROLE_SET_RESOLVER'], expected: [] },
    { roles: ['v2:ROLE_SET_RESOLVER_ADMIN'], expected: ['v2.eth'] },
  ])(
    'matches exact V2 roles and unions them with V1 relationships: $roles',
    ({ roles, expected }) => {
      const rows: NameRow[] = [
        row('owner.eth', 'ENSv1', ['owner']),
        {
          ...row('v2.eth', 'ENSv2', ['owner']),
          registryRoles: ['ROLE_RENEW', 'ROLE_SET_RESOLVER_ADMIN'],
        },
        row('unknown.eth', 'ENSv2', ['owner']),
      ]
      expect(filterNameRows(rows, [], roles).map((row) => row.name)).toEqual(
        expected,
      )
    },
  )
})
