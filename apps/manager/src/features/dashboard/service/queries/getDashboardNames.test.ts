import type { AddressNameRow } from '@ens-apps/bigname'
import { BignameError } from '@ens-apps/bigname'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listAddressNames: vi.fn() }))

vi.mock('@/lib/bigname', () => ({
  bigname: { listAddressNames: mocks.listAddressNames },
}))

import { dashboardRowMetadata } from '../../dashboardNames'
import { getDashboardNames, getDashboardNamesQuery } from './getDashboardNames'

const EOA = '0x1111111111111111111111111111111111111111'
const SMART = '0x2222222222222222222222222222222222222222'

const row = (overrides: Partial<AddressNameRow>): AddressNameRow => ({
  name: 'alice.eth',
  display_name: 'alice.eth',
  namespace: 'ens',
  namehash: `0x${overrides.name ?? 'alice.eth'}`,
  relations: ['owner'],
  is_primary: false,
  authority: 'ens_v2',
  registration_status: 'active',
  ...overrides,
})

const page = (data: readonly AddressNameRow[], nextCursor: string | null) => ({
  data,
  page: {
    cursor: null,
    next_cursor: nextCursor,
    page_size: data.length,
    total_count: null,
    has_more: nextCursor !== null,
  },
  meta: {},
})

describe('getDashboardNames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads every page per address and merges rows by namehash', async () => {
    mocks.listAddressNames.mockImplementation(
      async (
        address: string,
        params: { cursor?: string; relation?: string },
      ) => {
        if (params.relation === 'former_owner') return page([], null)
        if (address === EOA && !params.cursor) {
          return page([row({ name: 'alice.eth', relations: ['owner'] })], 'c1')
        }
        if (address === EOA) {
          return page(
            [
              row({
                name: 'legacy.eth',
                authority: 'ens_v1',
                relations: ['owner'],
              }),
              row({ name: 'lapsed.eth', registration_status: 'released' }),
            ],
            null,
          )
        }
        return page(
          [
            row({
              name: 'alice.eth',
              relations: ['manager'],
              is_primary: true,
            }),
          ],
          null,
        )
      },
    )

    const names = await getDashboardNames([EOA, SMART])

    expect(names).toEqual([
      expect.objectContaining({
        name: 'alice.eth',
        protocol: 'v2',
        nameRoles: ['owner', 'manager'],
      }),
      expect.objectContaining({
        name: 'legacy.eth',
        protocol: 'v1',
        nameRoles: ['owner'],
      }),
    ])
    expect(mocks.listAddressNames).toHaveBeenCalledWith(
      EOA,
      expect.objectContaining({
        namespace: 'ens',
        relation: 'any',
        sort: 'name',
        include: ['role_summary'],
        page_size: 200,
      }),
      expect.anything(),
    )
  })

  it('shrinks an overflowing page without dropping summaries', async () => {
    mocks.listAddressNames.mockImplementation(async (_address, params) => {
      if (params.relation === 'former_owner') return page([], null)
      if (params.page_size === 200)
        throw new BignameError({
          status: 422,
          code: 'unsupported',
          message: 'x',
        })
      return page([row({ name: 'alice.eth' })], null)
    })
    const names = await getDashboardNames([EOA])
    expect(names.map((item) => item.name)).toEqual(['alice.eth'])
    expect(mocks.listAddressNames).toHaveBeenLastCalledWith(
      EOA,
      expect.objectContaining({ page_size: 100, include: ['role_summary'] }),
      expect.anything(),
    )
  })

  it('keeps renewable former-owned names visible without inventing current authority', async () => {
    const now = Math.floor(Date.now() / 1000)
    mocks.listAddressNames.mockImplementation(async (_address, params) =>
      page(
        params.relation === 'former_owner'
          ? [
              row({
                registration_status: 'released',
                relations: ['former_owner'],
                expires_at: String(now - 1),
                grace_ends_at: String(now + 86400),
                lapsed_registration: {
                  owner: EOA,
                  held_through: 'registry',
                  release_kind: 'expired',
                },
              }),
            ]
          : [],
        null,
      ),
    )
    const names = await getDashboardNames([EOA])
    expect(names).toHaveLength(1)
    expect(names[0]?.nameRoles).toEqual([])
    assert(names[0])
    expect(dashboardRowMetadata(names[0]).expiryCta).toBe('renew')
  })

  it('rejects with a tagged error when bigname fails', async () => {
    mocks.listAddressNames.mockRejectedValue(
      new BignameError({ status: 503, code: 'overloaded', message: 'busy' }),
    )

    await expect(getDashboardNames([EOA])).rejects.toMatchObject({
      _tag: 'GetDashboardNamesError',
    })
  })
})

describe('getDashboardNamesQuery', () => {
  it('keys on the deduplicated, lowercased addresses', () => {
    expect(
      getDashboardNamesQuery([EOA.toUpperCase().replace('0X', '0x'), EOA])
        .queryKey,
    ).toEqual([{ $scope: 'dashboard', $action: 'names', addresses: [EOA] }])
  })
})
