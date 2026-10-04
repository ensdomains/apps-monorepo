import type { AddressNameRow, BignamePage } from '@ens-apps/bigname'
import { BignameError } from '@ens-apps/bigname'
import type { Address } from 'viem'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'

const bignameMock = vi.hoisted(() => ({
  listAddressNames: vi.fn(),
}))

vi.mock('@/lib/bigname', () => ({ bigname: bignameMock }))

import { getProfileAddressNames } from './profileAddressNames'

const ADDRESS = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF' as Address
const LOWER = ADDRESS.toLowerCase()

const row = (overrides: Partial<AddressNameRow>): AddressNameRow => ({
  name: 'name.eth',
  display_name: 'name.eth',
  namespace: 'ens',
  namehash: `0x${overrides.name ?? 'name.eth'}`,
  relations: ['owner', 'manager'],
  is_primary: false,
  authority: 'ens_v2',
  registration_status: 'active',
  expires_at: String(Date.parse('2030-01-01T00:00:00Z') / 1000),
  registered_at: String(Date.parse('2024-01-01T00:00:00Z') / 1000),
  created_at: String(Date.parse('2024-01-01T00:00:00Z') / 1000),
  ...overrides,
})

const page = (
  data: readonly AddressNameRow[],
  nextCursor: string | null = null,
): BignamePage<AddressNameRow> => ({
  data,
  page: {
    cursor: null,
    next_cursor: nextCursor,
    page_size: data.length,
    total_count: data.length,
    has_more: nextCursor !== null,
  },
  meta: {},
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getProfileAddressNames', () => {
  it('reads one relation=any collection with role summaries, newest first', async () => {
    bignameMock.listAddressNames.mockResolvedValue(page([]))

    await getProfileAddressNames(ADDRESS)

    expect(bignameMock.listAddressNames).toHaveBeenCalledExactlyOnceWith(
      LOWER,
      expect.objectContaining({
        namespace: 'ens',
        relation: 'any',
        sort: 'registered_at',
        order: 'desc',
        include: ['role_summary'],
        page_size: 200,
      }),
      expect.anything(),
    )
  })

  it('maps v1 and v2 rows, with protocol from authority', async () => {
    bignameMock.listAddressNames.mockResolvedValue(
      page([
        row({ name: 'henlo.eth', authority: 'ens_v2' }),
        row({
          name: 'figma.eth',
          authority: 'ens_v1',
          ens_v1: {
            expires_at: String(Date.parse('2029-11-01T00:00:00Z') / 1000),
          },
        }),
        row({ name: 'legacy.eth', authority: 'ens_v0' }),
      ]),
    )

    const result = await getProfileAddressNames(ADDRESS)

    assert(result.isOk())
    expect(
      result.value.map(({ label, protocol }) => [label, protocol]),
    ).toEqual([
      ['henlo.eth', 'v2'],
      ['figma.eth', 'v1'],
      ['legacy.eth', 'v1'],
    ])
    expect(result.value[0]).toMatchObject({
      expiryDate: Date.parse('2030-01-01T00:00:00Z') / 1000,
      registeredAt: Date.parse('2024-01-01T00:00:00Z') / 1000,
      roleCategory: 'owned',
    })
    // An ENSv1 name "Expires" with its lease, not the ENSv2 reservation.
    expect(result.value[1]?.expiryDate).toBe(
      Date.parse('2029-11-01T00:00:00Z') / 1000,
    )
  })

  it('derives chips from relations and ENSv2 grants', async () => {
    bignameMock.listAddressNames.mockResolvedValue(
      page([
        row({ name: 'owned.eth', relations: ['owner'] }),
        row({
          name: 'granted.eth',
          relations: ['owner'],
          role_summary: [
            {
              address: LOWER as `0x${string}`,
              grants: [
                {
                  grant_scope: { kind: 'registration', detail: {} },
                  powers: ['set_resolver'],
                },
              ],
            },
          ],
        }),
        row({ name: 'managed.eth', relations: ['manager'] }),
        row({
          name: 'v1-managed.eth',
          authority: 'ens_v1',
          relations: ['owner'],
          role_summary: [
            {
              address: LOWER as `0x${string}`,
              grants: [
                {
                  grant_scope: { kind: 'registration', detail: {} },
                  powers: ['registration_control'],
                },
              ],
            },
          ],
        }),
      ]),
    )

    const result = await getProfileAddressNames(ADDRESS)

    assert(result.isOk())
    expect(
      result.value.map(({ label, nameRoles, roleCategory }) => ({
        label,
        nameRoles,
        roleCategory,
      })),
    ).toEqual([
      { label: 'owned.eth', nameRoles: ['owner'], roleCategory: 'owned' },
      {
        label: 'granted.eth',
        nameRoles: ['owner', 'manager'],
        roleCategory: 'owned',
      },
      { label: 'managed.eth', nameRoles: ['manager'], roleCategory: 'managed' },
      // ENSv1 grants are the registration itself, not an extra role.
      { label: 'v1-managed.eth', nameRoles: ['owner'], roleCategory: 'owned' },
    ])
  })

  it('drops released and unregistered rows', async () => {
    bignameMock.listAddressNames.mockResolvedValue(
      page([
        row({ name: 'live.eth' }),
        row({ name: 'lapsed.eth', registration_status: 'released' }),
        row({ name: 'reserved.eth', registration_status: 'unregistered' }),
      ]),
    )

    const result = await getProfileAddressNames(ADDRESS)

    assert(result.isOk())
    expect(result.value.map((item) => item.label)).toEqual(['live.eth'])
  })

  it('reads a held name without expires_at as not expiring', async () => {
    bignameMock.listAddressNames.mockResolvedValue(
      page([
        row({
          name: 'sub.name.eth',
          expires_at: null,
          expires_at_reason: 'not_set',
        }),
      ]),
    )

    const result = await getProfileAddressNames(ADDRESS)

    assert(result.isOk())
    expect(result.value[0]?.expiryDate).toBe(0)
  })

  it('walks every page', async () => {
    bignameMock.listAddressNames
      .mockResolvedValueOnce(page([row({ name: 'a.eth' })], 'next'))
      .mockResolvedValueOnce(page([row({ name: 'b.eth' })]))

    const result = await getProfileAddressNames(ADDRESS)

    assert(result.isOk())
    expect(result.value.map((item) => item.label)).toEqual(['a.eth', 'b.eth'])
    expect(bignameMock.listAddressNames).toHaveBeenLastCalledWith(
      LOWER,
      expect.objectContaining({ cursor: 'next' }),
      expect.anything(),
    )
  })

  it('reads again without role summaries when the grant budget overflows', async () => {
    bignameMock.listAddressNames
      .mockRejectedValueOnce(
        new BignameError({
          status: 422,
          code: 'unsupported',
          message: 'role_summary grant budget exceeded',
        }),
      )
      .mockResolvedValueOnce(page([row({ name: 'a.eth' })]))

    const result = await getProfileAddressNames(ADDRESS)

    assert(result.isOk())
    expect(result.value.map((item) => item.label)).toEqual(['a.eth'])
    expect(bignameMock.listAddressNames).toHaveBeenLastCalledWith(
      LOWER,
      expect.objectContaining({ include: undefined }),
      expect.anything(),
    )
  })

  it('returns an error when bigname fails', async () => {
    bignameMock.listAddressNames.mockRejectedValue(
      new BignameError({ status: 503, code: 'overloaded', message: 'busy' }),
    )

    const result = await getProfileAddressNames(ADDRESS)

    expect(result.isErr()).toBe(true)
  })
})
