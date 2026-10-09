import type {
  NameSummary,
  Page,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { IndexerReadError } from '@ens-apps/indexer/reads'
import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { getPrimaryNameDomains } from './getPrimaryNameDomains'

vi.mock('@/lib/bigname', () => ({ bigname: {} }))

const ADDRESS = '0x0000000000000000000000000000000000000abc'

const summary = (
  name: string,
  namehash: `0x${string}` = `0x${name.length}`,
): NameSummary => ({
  name,
  displayName: name,
  namehash,
  protocol: 'v2',
  relations: ['owner'],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'active',
  expiresAt: null,
  servedExpiry: null,
  registeredAt: null,
  createdAt: null,
})

const page = (
  items: readonly NameSummary[],
  nextCursor: string | null = null,
): Page<NameSummary> => ({ items, nextCursor, totalCount: null })

describe('getPrimaryNameDomains', () => {
  it('asks for owned ENSv2 names by name and maps them to dialog rows', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(() =>
      okAsync(page([summary('alice.eth', '0x01')])),
    )

    const result = await getPrimaryNameDomains(readNames, ADDRESS)

    expect(result._unsafeUnwrap()).toEqual([{ id: '0x01', name: 'alice.eth' }])
    expect(readNames).toHaveBeenCalledWith({
      address: ADDRESS,
      relations: ['owner'],
      protocol: 'v2',
      sort: 'name',
      order: 'asc',
      pageSize: 200,
    })
  })

  it('follows the cursor until every page is read', async () => {
    const pages = [
      page([summary('a.eth', '0x01')], 'c1'),
      page([summary('b.eth', '0x02')], 'c2'),
      page([summary('c.eth', '0x03')]),
    ]
    let call = 0
    const readNames = vi.fn<ReadNamesForAddress>(() =>
      okAsync(pages[call++] ?? page([])),
    )

    const result = await getPrimaryNameDomains(readNames, ADDRESS)

    expect(result._unsafeUnwrap().map(({ name }) => name)).toEqual([
      'a.eth',
      'b.eth',
      'c.eth',
    ])
    expect(readNames).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ cursor: 'c2' }),
    )
  })

  it('passes a read failure on', async () => {
    const failure = new IndexerReadError({
      message: 'unavailable',
      kind: 'unavailable',
      cause: new Error('down'),
    })

    const result = await getPrimaryNameDomains(
      vi.fn<ReadNamesForAddress>(() => errAsync(failure)),
      ADDRESS,
    )

    expect(result._unsafeUnwrapErr()).toBe(failure)
  })
})
