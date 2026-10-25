import {
  type ColumnFiltersState,
  createTable,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/react-table'
import { describe, expect, it } from 'vitest'
import { columns, type NameRow } from './columns'

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

const makeTable = (
  data: NameRow[],
  columnFilters: ColumnFiltersState = [],
  sorting: SortingState = [],
) =>
  createTable({
    data,
    columns,
    state: { columnFilters, sorting },
    onStateChange: () => {},
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

const filterNames = (data: NameRow[], levels: string[], roles: string[]) =>
  makeTable(data, [
    ...(levels.length ? [{ id: 'levels', value: levels }] : []),
    ...(roles.length ? [{ id: 'roles', value: roles }] : []),
  ])
    .getFilteredRowModel()
    .rows.map((row) => row.original)

describe('names table filters', () => {
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
      filterNames(names, levels, relations).map((row) => row.name),
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
      expect(filterNames(rows, [], roles).map((row) => row.name)).toEqual(
        expected,
      )
    },
  )

  it('facets each role separately while respecting other filters and excluding its own filter', () => {
    const table = makeTable(
      [
        row('one.eth', 'ENSv1', ['owner', 'manager']),
        row('sub.one.eth', 'ENSv1', ['manager']),
        {
          ...row('two.eth', 'ENSv2', ['owner']),
          registryRoles: ['ROLE_RENEW', 'ROLE_SET_RESOLVER_ADMIN'],
        },
      ],
      [
        { id: 'levels', value: ['2ld'] },
        { id: 'roles', value: ['owner'] },
      ],
    )
    expect([
      ...(table.getColumn('roles')?.getFacetedUniqueValues() ?? []),
    ]).toEqual([
      ['owner', 1],
      ['manager', 1],
      ['v2:ROLE_RENEW', 1],
      ['v2:ROLE_SET_RESOLVER_ADMIN', 1],
    ])
    expect(
      table.getFilteredRowModel().rows.map((row) => row.original.name),
    ).toEqual(['one.eth'])
  })

  it('sorts V2 roles by the displayed count instead of the relation count', () => {
    const table = makeTable(
      [
        { ...row('many.eth', 'ENSv2', ['owner']), roleCount: 8 },
        { ...row('few.eth', 'ENSv2', ['owner']), roleCount: 2 },
        row('v1.eth', 'ENSv1', ['owner', 'manager']),
      ],
      [],
      [{ id: 'roles', desc: true }],
    )
    expect(
      table.getSortedRowModel().rows.map((row) => row.original.name),
    ).toEqual(['many.eth', 'few.eth', 'v1.eth'])
  })

  it('combines name, length, status, and shown-expiry filters and removes empty filter values', () => {
    const from = new Date(2030, 0, 1)
    const to = new Date(2030, 11, 31)
    const table = makeTable(
      [
        {
          ...row('sub.parent.eth', 'ENSv1', ['manager']),
          parentExpiryDate: new Date(2030, 5, 1),
        },
        {
          ...row('sub.other.eth', 'ENSv1', ['manager']),
          parentExpiryDate: new Date(2031, 5, 1),
        },
        {
          ...row('long.parent.eth', 'ENSv1', ['manager']),
          parentExpiryDate: new Date(2030, 5, 1),
        },
        {
          ...row('sub.parent.com', 'ENSv1', ['manager']),
          expiryDate: new Date(2030, 5, 1),
        },
      ],
      [
        { id: 'name', value: ' SUB. ' },
        { id: 'lengths', value: ['3'] },
        { id: 'statuses', value: ['expires-with-parent'] },
        { id: 'expiryDate', value: { from, to } },
      ],
    )
    expect(
      table.getFilteredRowModel().rows.map((row) => row.original.name),
    ).toEqual(['sub.parent.eth'])
    let next: ColumnFiltersState = []
    table.setOptions((options) => ({
      ...options,
      onColumnFiltersChange: (update) => {
        next =
          typeof update === 'function'
            ? update(options.state.columnFilters ?? [])
            : update
      },
    }))
    table.getColumn('lengths')?.setFilterValue([])
    expect(next.map((filter) => filter.id)).not.toContain('lengths')
    table.getColumn('expiryDate')?.setFilterValue({})
    expect(next.map((filter) => filter.id)).not.toContain('expiryDate')
  })
})
