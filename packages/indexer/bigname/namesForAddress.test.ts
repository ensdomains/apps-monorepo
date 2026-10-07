import { describe, expect, it } from 'vitest'
import { apiError, clientWith, envelope, requestOf } from './fetch.mock'
import { readNamesForAddress } from './namesForAddress'
import type { AddressName } from './types'

const row = {
  name: 'alice.eth',
  display_name: 'alice.eth',
  namespace: 'ens',
  namehash: '0xabc',
  owner: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
  registrant: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
  registration_status: 'registered',
  registered_at: '1790594976',
  created_at: '1790594976',
  expires_at: '1885289376',
  authority: 'ens_v2',
  migrated_at: '1790640000',
  relations: ['owner', 'role_holder', 'resolves_to'],
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

describe('readNamesForAddress', () => {
  it('serializes the query in bigname terms', async () => {
    const { client, fetch } = clientWith(envelope([], page))

    await readNamesForAddress(client)({
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
      'https://bigname.example/v1/addresses/0xb15c4ca5ec894369dec40f6298e63eae60db2756/names?relation=owner%2Cmanager&authority=ens_v1%2Cens_v0&is_migrated=true&q=ali&sort=expires_at&order=desc&include=counts&page_size=25&cursor=c1',
    )
  })

  it('searches inside names, narrows by parent, sorts by first observation and asks for an exact total', async () => {
    const { client, fetch } = clientWith(envelope([], page))

    await readNamesForAddress(client)({
      address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
      protocol: 'v2',
      contains: 'lic',
      parent: 'eth',
      sort: 'created',
      includeCounts: true,
      includeTotal: true,
    })

    expect(requestOf(fetch).url).toBe(
      'https://bigname.example/v1/addresses/0xb15c4ca5ec894369dec40f6298e63eae60db2756/names?relation=any&authority=ens_v2&parent=eth&q=lic&match=contains&sort=created_at&include=counts%2Ctotal_count',
    )
  })

  it.each([
    undefined,
    [],
  ])('reads every relation when %s is asked for, and sends nothing else', async (relations) => {
    const { client, fetch } = clientWith(envelope([], page))

    await readNamesForAddress(client)({
      address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
      relations,
    })

    expect(requestOf(fetch).url).toMatch(/names\?relation=any$/)
  })

  it('renders the wire rows the way the dashboards need them, with the page', async () => {
    const { client } = clientWith(envelope([row], page))

    const result = await readNamesForAddress(client)({
      address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
    })

    expect(result._unsafeUnwrap()).toEqual({
      items: [
        {
          name: 'alice.eth',
          displayName: 'alice.eth',
          namehash: '0xabc',
          protocol: 'v2',
          relations: ['owner', 'role_holder'],
          isPrimary: true,
          isMigrated: true,
          registrationStatus: 'registered',
          expiresAt: new Date('2029-09-28T11:29:36Z'),
          servedExpiry: 1_885_289_376n,
          registeredAt: new Date('2026-09-28T11:29:36Z'),
          createdAt: new Date('2026-09-28T11:29:36Z'),
          subnameCount: 2,
        },
      ],
      nextCursor: 'c2',
      totalCount: 4,
    })
  })

  it('keeps a served expiry past any date exactly, for the backend order', async () => {
    const { client } = clientWith(
      envelope([{ ...row, expires_at: '9223372036854775807' }], page),
    )

    const [summary] = (
      await readNamesForAddress(client)({
        address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
      })
    )._unsafeUnwrap().items

    expect(summary?.expiresAt).toBeNull()
    expect(summary?.servedExpiry).toBe(9_223_372_036_854_775_807n)
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
      await readNamesForAddress(client)({
        address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
      })
    )._unsafeUnwrap().items

    expect(summary?.expiresAt).toBeNull()
    expect(summary?.servedExpiry).toBeNull()
    expect(summary?.isMigrated).toBe(false)
    expect(summary?.protocol).toBe('v1')

    const legacy = (
      await readNamesForAddress(
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
      await readNamesForAddress(client)({
        address: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
        cursor: 'old',
      })
    )._unsafeUnwrapErr()

    expect(error._tag).toBe('INDEXER_READ_ERROR')
    expect(error.kind).toBe('stale')
    expect(error.cause).toMatchObject({ code: 'stale', status: 409 })
  })
})
