import type {
  NameSummary,
  Page,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { IndexerReadError } from '@ens-apps/indexer/reads'
import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { getProfileAddressNames } from './profileAddressNames'

vi.mock('@/lib/bigname', () => ({ bigname: {} }))

const ADDRESS = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'

const summary = (name: string): NameSummary => ({
  name,
  displayName: name,
  namehash: `0x${name.length.toString(16)}`,
  protocol: 'v2',
  relations: ['owner'],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'registered',
  expiresAt: null,
  expiresAfterAnyDate: false,
  registeredAt: null,
  createdAt: null,
})

const page = (
  items: readonly NameSummary[],
  nextCursor: string | null = null,
): Page<NameSummary> => ({ items, nextCursor, totalCount: null })

describe('getProfileAddressNames', () => {
  it('reads every relation, newest registration first, in one stream', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(() =>
      okAsync(page([summary('alice.eth')])),
    )

    const result = await getProfileAddressNames(readNames, ADDRESS)

    expect(result._unsafeUnwrap().map(({ label }) => label)).toEqual([
      'alice.eth',
    ])
    expect(readNames).toHaveBeenCalledWith({
      address: ADDRESS,
      sort: 'registered',
      order: 'desc',
      pageSize: 200,
    })
  })

  it('follows the cursor until every page is read', async () => {
    const pages = [page([summary('a.eth')], 'c1'), page([summary('bb.eth')])]
    let call = 0
    const readNames = vi.fn<ReadNamesForAddress>(() =>
      okAsync(pages[call++] ?? page([])),
    )

    const result = await getProfileAddressNames(readNames, ADDRESS)

    expect(result._unsafeUnwrap()).toHaveLength(2)
    expect(readNames).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'c1' }),
    )
  })

  it('passes a read failure on', async () => {
    const failure = new IndexerReadError({
      message: 'unavailable',
      kind: 'unavailable',
      cause: new Error('down'),
    })

    const result = await getProfileAddressNames(
      vi.fn<ReadNamesForAddress>(() => errAsync(failure)),
      ADDRESS,
    )

    expect(result._unsafeUnwrapErr()).toBe(failure)
  })
})
