import { describe, expect, it } from 'vitest'
import { apiError, clientWith, envelope, requestOf } from './fetch.mock'
import { namesForAddress } from './namesForAddress'
import type { AddressName } from './types'

const row = {
  name: 'alice.eth',
  display_name: 'alice.eth',
  namespace: 'ens',
  namehash: '0xabc',
  owner: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
  registrant: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
  registration_status: 'registered',
  registered_at: '2026-09-28T11:29:36Z',
  created_at: '2026-09-28T11:29:36Z',
  expires_at: '2029-09-28T11:29:36Z',
  authority: 'ens_v2',
  migrated_at: '2026-09-29T00:00:00Z',
  relations: ['owner', 'registrant', 'resolves_to'],
  is_primary: true,
  subname_count: 2,
} satisfies AddressName

const page = {
  cursor: null,
  next_cursor: 'c2',
  page_size: 50,
  total_count: 4,
  has_more: true,
}

describe('namesForAddress', () => {
  it('serializes the query in bigname terms', async () => {
    const { client, fetch } = clientWith(envelope([], page))

    await namesForAddress(client)({
      address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
      relations: ['owner', 'manager'],
      protocol: 'v1',
      migratedOnly: true,
      prefix: 'ali',
      sort: 'expiry',
      order: 'desc',
      includeCounts: true,
      pageSize: 25,
      cursor: 'c1',
    })

    expect(requestOf(fetch).url).toBe(
      'https://bigname.example/v1/addresses/0xb15c4ca5ec894369dec40f6298e63eae60db2756/names?relation=owner%2Cmanager&authority=ens_v1&is_migrated=true&q=ali&sort=expires_at&order=desc&include=counts&page_size=25&cursor=c1',
    )
  })

  it('defaults to every relation and sends nothing else', async () => {
    const { client, fetch } = clientWith(envelope([], page))

    await namesForAddress(client)({
      address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
    })

    expect(requestOf(fetch).url).toMatch(/names\?relation=any$/)
  })

  it('renders the wire rows the way the dashboards need them, with the page', async () => {
    const { client } = clientWith(envelope([row], page))

    const result = await namesForAddress(client)({
      address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
    })

    expect(result._unsafeUnwrap()).toEqual({
      items: [
        {
          name: 'alice.eth',
          namehash: '0xabc',
          protocol: 'v2',
          relations: ['owner', 'registrant'],
          isPrimary: true,
          isMigrated: true,
          registrationStatus: 'registered',
          expiresAt: new Date('2029-09-28T11:29:36Z'),
          registeredAt: new Date('2026-09-28T11:29:36Z'),
          createdAt: new Date('2026-09-28T11:29:36Z'),
          subnameCount: 2,
        },
      ],
      nextCursor: 'c2',
      totalCount: 4,
    })
  })

  it('treats an omitted expiry as no expiry and an omitted migration as not migrated', async () => {
    const {
      expires_at: _expiry,
      migrated_at: _migrated,
      subname_count: _count,
      ...bare
    } = row
    const { client } = clientWith(
      envelope([{ ...bare, authority: 'ens_v1' }], page),
    )

    const [summary] = (
      await namesForAddress(client)({
        address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
      })
    )._unsafeUnwrap().items

    expect(summary?.expiresAt).toBeNull()
    expect(summary?.isMigrated).toBe(false)
    expect(summary?.protocol).toBe('v1')

    const legacy = (
      await namesForAddress(
        clientWith(envelope([{ ...bare, authority: 'ens_v0' }], page)).client,
      )({
        address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
      })
    )._unsafeUnwrap().items[0]
    expect(legacy?.protocol).toBe('v1')
    expect(summary).not.toHaveProperty('subnameCount')
  })

  it('maps a stale cursor to a stale read error with the cause attached', async () => {
    const { client } = clientWith(apiError('stale', 409))

    const error = (
      await namesForAddress(client)({
        address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
        cursor: 'old',
      })
    )._unsafeUnwrapErr()

    expect(error._tag).toBe('INDEXER_READ_ERROR')
    expect(error.kind).toBe('stale')
    expect(error.cause).toMatchObject({ code: 'stale', status: 409 })
  })
})
