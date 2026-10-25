import type { AddressName } from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import {
  getAddressRoleCountsQueryOptions,
  getAddressRolesQueryOptions,
  withAddressRoles,
  withRoleCounts,
} from './useAddressRoleCounts'

vi.mock('@/lib/bigname', () => ({ bigname: { addressNames: vi.fn() } }))

const ADDRESS = '0x1111111111111111111111111111111111111111'
const SCOPE = { kind: 'registry', detail: {} } as const

const row = (name: string, powers: readonly string[]): AddressName => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: '0x01',
  status: 'active',
  authority: 'ens_v2',
  relations: ['owner'],
  is_primary: false,
  role_summary: [
    { address: ADDRESS, grants: [{ grant_scope: SCOPE, powers }] },
  ],
})

const roleCounts = async () => {
  const observer = new QueryObserver(new QueryClient(), {
    ...getAddressRoleCountsQueryOptions({ address: ADDRESS }),
    retry: false,
  })
  const result = await observer.refetch({ throwOnError: true })
  observer.destroy()
  return result.data
}

beforeEach(() => vi.clearAllMocks())

describe('getAddressRoleCountsQueryOptions', () => {
  it('counts the registry roles the powers stand for, can_name included', async () => {
    vi.mocked(bigname.addressNames).mockReturnValue(
      okAsync({
        data: [
          row('alice.eth', [
            'set_resolver',
            'admin_set_resolver',
            'can_name',
            'admin_can_name',
          ]),
        ],
        page: {
          cursor: null,
          next_cursor: null,
          page_size: 50,
          total_count: null,
          has_more: false,
        },
        meta: { as_of: {} },
      }),
    )

    expect(await roleCounts()).toEqual(new Map([['alice.eth', 4]]))
    const client = new QueryClient()
    await client.fetchQuery(getAddressRolesQueryOptions({ address: ADDRESS }))
    const observer = new QueryObserver(client, {
      ...getAddressRoleCountsQueryOptions({ address: ADDRESS }),
      staleTime: Infinity,
    })
    expect(observer.getCurrentResult().data).toEqual(
      new Map([['alice.eth', 4]]),
    )
    observer.destroy()
    expect(vi.mocked(bigname.addressNames)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(bigname.addressNames).mock.calls[0]?.[1]).toMatchObject({
      authority: ['ens_v2'],
      include: ['role_summary'],
      page_size: 50,
    })
  })

  it('fails on its own, leaving the names list to render without counts', async () => {
    vi.mocked(bigname.addressNames).mockReturnValue(
      errAsync(new BignameError({ code: 'request_timeout', message: 'slow' })),
    )

    await expect(roleCounts()).rejects.toMatchObject({
      _tag: 'GetAddressRoleCountsError',
    })
  })
})

describe('withRoleCounts', () => {
  it('adds a count to ENSv2 rows only', () => {
    const rows = [
      { name: 'v2.eth', protocolVersion: 'ENSv2' },
      { name: 'v1.eth', protocolVersion: 'ENSv1' },
    ]
    const counts = new Map([
      ['v2.eth', 3],
      ['v1.eth', 4],
    ])

    expect(withRoleCounts(rows, counts)).toEqual([
      { name: 'v2.eth', protocolVersion: 'ENSv2', roleCount: 3 },
      { name: 'v1.eth', protocolVersion: 'ENSv1' },
    ])
  })

  it('marks ENSv2 rows while counts load or after they fail', () => {
    const rows = [
      { name: 'v2.eth', protocolVersion: 'ENSv2' },
      { name: 'v1.eth', protocolVersion: 'ENSv1' },
    ]

    expect(withRoleCounts(rows, 'loading')[0]?.roleCount).toBe('loading')
    expect(withRoleCounts(rows, 'unavailable')[0]?.roleCount).toBe(
      'unavailable',
    )
    expect(withRoleCounts(rows, 'loading')[1]).not.toHaveProperty('roleCount')
  })

  it('leaves a name held only as a former owner in grace alone', () => {
    const rows = [
      {
        name: 'lapsed.eth',
        protocolVersion: 'ENSv2',
        relations: ['former_owner'],
      },
    ]

    expect(withRoleCounts(rows, 'loading')[0]).not.toHaveProperty('roleCount')
    expect(withRoleCounts(rows, 'unavailable')[0]).not.toHaveProperty(
      'roleCount',
    )
  })
})

describe('withAddressRoles', () => {
  it('retains exact V2 roles alongside counts, without adding roles to V1 or former owners', () => {
    const rows = [
      { name: 'v2.eth', protocolVersion: 'ENSv2', relations: ['role_holder'] },
      { name: 'v1.eth', protocolVersion: 'ENSv1', relations: ['owner'] },
      {
        name: 'former.eth',
        protocolVersion: 'ENSv2',
        relations: ['former_owner'],
      },
    ]
    const roles = ['ROLE_RENEW', 'ROLE_SET_RESOLVER_ADMIN'] as const
    const result = withAddressRoles(rows, {
      data: new Map(rows.map((row) => [row.name, roles])),
      isError: false,
    })
    expect(result).toEqual([
      { ...rows[0], registryRoles: roles, roleCount: 2 },
      rows[1],
      rows[2],
    ])
    expect(withAddressRoles(rows, { isError: true })[0]).toMatchObject({
      roleCount: 'unavailable',
      registryRoles: undefined,
    })
  })
})
