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
const OWNER = '0x0000000000000000000000000000000000000def'

const summary = (
  name: string,
  namehash: `0x${string}` = `0x${name.length}`,
  protocol: NameSummary['protocol'] = 'v2',
): NameSummary => ({
  name,
  displayName: name,
  namehash,
  protocol,
  relations: ['owner'],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'active',
  expiresAt: null,
  servedExpiry: null,
  graceEndsAt: null,
  registeredAt: null,
  createdAt: null,
})

const page = (
  items: readonly NameSummary[],
  nextCursor: string | null = null,
): Page<NameSummary> => ({ items, nextCursor, totalCount: null })

describe('getPrimaryNameDomains', () => {
  // An ENSv1 name that resolves to its owner can be a primary name, so the
  // read must not ask bigname for one protocol.
  it('asks for owned names of either protocol and maps them to dialog rows', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(() =>
      okAsync(
        page([
          summary('alice.eth', '0x01'),
          summary('sub.legacy.eth', '0x02', 'v1'),
        ]),
      ),
    )

    const result = await getPrimaryNameDomains(readNames, ADDRESS)

    expect(result._unsafeUnwrap()).toEqual([
      { id: '0x01', name: 'alice.eth', protocol: 'v2' },
      // The protocol rides along: the dialog needs it to tell an ENSv1 name
      // apart before offering ENSv2-only resolver setup.
      { id: '0x02', name: 'sub.legacy.eth', protocol: 'v1' },
    ])
    expect(readNames).toHaveBeenCalledWith(
      {
        address: ADDRESS,
        relations: ['owner'],
        sort: 'name',
        order: 'asc',
        pageSize: 200,
      },
      expect.anything(),
    )
  })

  it('offers no name that cannot be set as primary', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(() =>
      okAsync(
        page([
          summary('alice.eth', '0x01'),
          summary(`[${'1'.repeat(64)}].eth`, '0x02'),
          summary('ALICE.eth', '0x03'),
        ]),
      ),
    )

    const result = await getPrimaryNameDomains(readNames, ADDRESS)

    expect(result._unsafeUnwrap()).toEqual([
      { id: '0x01', name: 'alice.eth', protocol: 'v2' },
    ])
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
      expect.anything(),
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

  it('adds names still resolving to the owner wallet, once each and in name order', async () => {
    const readNames = vi.fn<ReadNamesForAddress>((query) =>
      okAsync(
        page(
          query.resolvesTo
            ? [summary('alice.eth', '0x01'), summary('fox-1.eth', '0x02')]
            : [summary('alice.eth', '0x01'), summary('zed.eth', '0x03')],
        ),
      ),
    )

    const result = await getPrimaryNameDomains(readNames, ADDRESS, OWNER)

    expect(result._unsafeUnwrap().map(({ name }) => name)).toEqual([
      'alice.eth',
      'fox-1.eth',
      'zed.eth',
    ])
    expect(readNames).toHaveBeenCalledWith(
      expect.objectContaining({ address: OWNER, resolvesTo: true }),
      expect.anything(),
    )
  })

  it('passes a failed resolving-names read on instead of listing only owned names', async () => {
    const failure = new IndexerReadError({
      message: 'unavailable',
      kind: 'unavailable',
      cause: new Error('down'),
    })
    const readNames = vi.fn<ReadNamesForAddress>((query) =>
      query.resolvesTo ? errAsync(failure) : okAsync(page([])),
    )

    const result = await getPrimaryNameDomains(readNames, ADDRESS, OWNER)

    expect(result._unsafeUnwrapErr()).toBe(failure)
  })
})
