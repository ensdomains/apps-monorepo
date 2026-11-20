import {
  IndexerReadError,
  type NameDetail,
  type NameSummary,
} from '@ens-apps/indexer/reads'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { indexer } from '@/lib/indexer'
import { getResolvedNamesPage } from './useNamesForResolvedAddress'

vi.mock('@/lib/indexer', () => ({
  indexer: { getNamesForAddress: vi.fn(), getNames: vi.fn() },
}))

const ADDRESS = '0x996695a9072094d29f93aebd4229e3d5fb6bf231'

const row = (name: string, coinTypes: readonly number[]): NameSummary => ({
  name,
  displayName: name,
  namehash: '0x01',
  protocol: 'v2',
  relations: [],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'active',
  expiresAt: null,
  servedExpiry: null,
  graceEndsAt: null,
  registeredAt: null,
  createdAt: null,
  resolvedCoinTypes: coinTypes,
})

// The coin types with an address record, cleared ones already left out.
const detail = (
  name: string,
  addressCoinTypes: readonly string[] | null,
): NameDetail => ({
  name,
  displayName: name,
  namehash: '0x01',
  protocol: 'v2',
  isSupported: true,
  owner: null,
  manager: null,
  registrant: null,
  resolver: null,
  registrationStatus: 'active',
  expiresAt: null,
  graceEndsAt: null,
  registeredAt: null,
  registrationId: null,
  createdAt: null,
  migratedAt: null,
  unresolvableReason: null,
  addressCoinTypes,
})

const pageOf = (rows: readonly NameSummary[], next: string | null = null) =>
  okAsync({ items: rows, nextCursor: next, totalCount: null })

const listed = (rows: readonly NameSummary[], next: string | null = null) =>
  vi.mocked(indexer.getNamesForAddress).mockReturnValue(pageOf(rows, next))

const tooMany = () =>
  errAsync(
    new IndexerReadError({
      kind: 'unsupported',
      message: 'too many',
      cause: null,
    }),
  )

const readFirst = () =>
  getResolvedNamesPage({ address: ADDRESS }, { coinType: 'evm' })

const detailed = (details: readonly (NameDetail | null)[]) =>
  vi.mocked(indexer.getNames).mockReturnValue(okAsync(details))

beforeEach(() => vi.clearAllMocks())

describe('getResolvedNamesForAddress', () => {
  it('asks the indexer for the names whose EVM address records hold the address', async () => {
    listed([row('juveniles.eth', [60])])
    detailed([detail('juveniles.eth', ['60'])])

    await readFirst()

    expect(indexer.getNamesForAddress).toHaveBeenCalledWith(
      {
        address: ADDRESS,
        resolvesTo: true,
        coinType: 'evm',
        sort: 'name',
        order: 'asc',
        pageSize: 100,
      },
      { signal: undefined },
    )
    expect(indexer.getNames).toHaveBeenCalledWith(
      { names: ['juveniles.eth'] },
      { signal: undefined },
    )
  })

  it('reads one page and hands back the cursor to the next', async () => {
    listed([row('a.eth', [60])], 'next')
    detailed([detail('a.eth', ['60'])])

    const page = (await readFirst())._unsafeUnwrap()

    expect(page.next).toEqual({ cursor: 'next', coinType: 'evm' })
    expect(page.isEthereumOnly).toBe(false)
  })

  it('lists each name with the networks it has an address for, cleared ones excluded', async () => {
    listed([row('juveniles.eth', [2147483658])])
    detailed([detail('juveniles.eth', ['60', '0', '2147483658'])])

    const { names } = (await readFirst())._unsafeUnwrap()

    expect(names.map(({ name }) => name)).toEqual(['juveniles.eth'])
    expect(names[0]?.coinTypes.toSorted()).toEqual(['0', '2147483658', '60'])
  })

  it('falls back to Ethereum records when a name matched too many networks', async () => {
    vi.mocked(indexer.getNamesForAddress)
      .mockReturnValueOnce(tooMany())
      .mockReturnValueOnce(pageOf([row('a.eth', [60])]))
    detailed([detail('a.eth', ['60'])])

    const page = (await readFirst())._unsafeUnwrap()

    expect(
      vi.mocked(indexer.getNamesForAddress).mock.calls[1]?.[0],
    ).toMatchObject({ coinType: 60 })
    expect(page.isEthereumOnly).toBe(true)
    expect(page.names[0]?.coinTypes).toEqual(['60'])
  })

  it('fails a later page that matched too many networks', async () => {
    vi.mocked(indexer.getNamesForAddress).mockReturnValue(tooMany())

    const result = await getResolvedNamesPage(
      { address: ADDRESS },
      { cursor: 'next', coinType: 'evm' },
    )

    expect(result._unsafeUnwrapErr()._tag).toBe(
      'GetResolvedNamesForAddressError',
    )
    expect(indexer.getNamesForAddress).toHaveBeenCalledOnce()
  })

  it('is empty without a lookup when no name points at the address', async () => {
    listed([])

    const { names } = (await readFirst())._unsafeUnwrap()

    expect(names).toEqual([])
    expect(indexer.getNames).not.toHaveBeenCalled()
  })

  it('lists only the matched networks for a name the indexer could not read', async () => {
    listed([row('a.eth', [60])])
    detailed([null])

    const { names } = (await readFirst())._unsafeUnwrap()

    expect(names[0]?.coinTypes).toEqual(['60'])
  })

  it('fails when the lookup answers a different number of names', async () => {
    listed([row('a.eth', [60]), row('b.eth', [60])])
    detailed([detail('a.eth', ['60'])])

    const result = await readFirst()

    expect(result._unsafeUnwrapErr()._tag).toBe(
      'GetResolvedNamesForAddressError',
    )
  })
})
