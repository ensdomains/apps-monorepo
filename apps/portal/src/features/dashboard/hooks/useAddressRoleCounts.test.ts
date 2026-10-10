import type { AddressName } from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import { QueryClient } from '@tanstack/react-query'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import {
  getAddressRoleCountsQueryOptions,
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

const roleCounts = () =>
  new QueryClient().fetchQuery({
    ...getAddressRoleCountsQueryOptions({ address: ADDRESS }),
    retry: false,
  })

beforeEach(() => vi.clearAllMocks())

describe('getAddressRoleCountsQueryOptions', () => {
  it('counts the ensjs roles the powers stand for, leaving out can_name', async () => {
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

    expect(await roleCounts()).toEqual(new Map([['alice.eth', 2]]))
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
    expect(withRoleCounts(rows, undefined)).toBe(rows)
  })
})
