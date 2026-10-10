import type {
  NameSummary,
  Page,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { IndexerReadError } from '@ens-apps/indexer/reads'
import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { hasDashboardNames } from './hasDashboardNames'

vi.mock('@/lib/bigname', () => ({ bigname: {} }))

const ADDRESS = '0x0000000000000000000000000000000000000abc'

const summary = (
  name: string,
  registrationStatus: NameSummary['registrationStatus'] = 'active',
): NameSummary => ({
  name,
  displayName: name,
  namehash: '0x01',
  protocol: 'v2',
  relations: ['owner'],
  isPrimary: false,
  isMigrated: false,
  registrationStatus,
  expiresAt: null,
  servedExpiry: null,
  registeredAt: null,
  createdAt: null,
})

const page = (
  items: readonly NameSummary[],
  nextCursor: string | null = null,
): Page<NameSummary> => ({ items, nextCursor, totalCount: null })

const readerOf = (...pages: readonly Page<NameSummary>[]) => {
  let call = 0
  return vi.fn<ReadNamesForAddress>(() => {
    const next = pages[call++]
    return next ? okAsync(next) : okAsync(page([]))
  })
}

describe('hasDashboardNames', () => {
  it('asks for owned names and answers yes on the first listed name', async () => {
    const readNames = readerOf(page([summary('alice.eth')], 'c1'))

    const result = await hasDashboardNames(readNames, ADDRESS)

    expect(result._unsafeUnwrap()).toBe(true)
    expect(readNames).toHaveBeenCalledTimes(1)
    expect(readNames).toHaveBeenCalledWith({
      address: ADDRESS,
      relations: ['owner'],
      pageSize: 50,
    })
  })

  it.each([
    ['a reverse record', summary('abc.addr.reverse')],
    ['a reverse record in another namespace', summary('abc.default.reverse')],
    ['a released name', summary('gone.eth', 'released')],
    ['an unregistered name', summary('never.eth', 'unregistered')],
  ])('answers no when the only name is %s', async (_label, name) => {
    const result = await hasDashboardNames(readerOf(page([name])), ADDRESS)

    expect(result._unsafeUnwrap()).toBe(false)
  })

  it('reads the next page when the first holds only hidden names', async () => {
    const readNames = readerOf(
      page([summary('abc.addr.reverse')], 'c1'),
      page([summary('alice.eth')]),
    )

    const result = await hasDashboardNames(readNames, ADDRESS)

    expect(result._unsafeUnwrap()).toBe(true)
    expect(readNames).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'c1' }),
    )
  })

  const hiddenThen = (count: number, last: string) => {
    const hiddenPages = Array.from({ length: count }, (_, index) =>
      page([summary(`${index}.addr.reverse`)], `page-${index + 1}`),
    )
    return vi.fn<ReadNamesForAddress>(({ cursor }) => {
      const index = cursor ? Number(cursor.replace('page-', '')) : 0
      return okAsync(hiddenPages[index] ?? page([summary(last)]))
    })
  }

  it('reads past pages of hidden names', async () => {
    const readNames = hiddenThen(2, 'alice.eth')

    expect((await hasDashboardNames(readNames, ADDRESS))._unsafeUnwrap()).toBe(
      true,
    )
    expect(readNames).toHaveBeenCalledTimes(3)
  })

  it('stops after four pages of hidden names', async () => {
    const readNames = hiddenThen(5, 'alice.eth')

    expect((await hasDashboardNames(readNames, ADDRESS))._unsafeUnwrap()).toBe(
      false,
    )
    expect(readNames).toHaveBeenCalledTimes(4)
  })

  it('lists a name no deployment answers for as nothing to show', async () => {
    const readNames = vi.fn<ReadNamesForAddress>(() =>
      okAsync(page([{ ...summary('alice.eth'), protocol: null }])),
    )

    expect((await hasDashboardNames(readNames, ADDRESS))._unsafeUnwrap()).toBe(
      false,
    )
  })

  it('retries a stale page with the same cursor', async () => {
    const stale = new IndexerReadError({
      message: 'stale',
      kind: 'stale',
      cause: new Error('snapshot moved'),
    })
    const readNames = vi
      .fn<ReadNamesForAddress>()
      .mockReturnValueOnce(okAsync(page([summary('abc.addr.reverse')], 'next')))
      .mockReturnValueOnce(errAsync(stale))
      .mockReturnValueOnce(okAsync(page([summary('alice.eth')])))

    const result = await hasDashboardNames(readNames, ADDRESS)

    expect(result._unsafeUnwrap()).toBe(true)
    expect(readNames.mock.calls.map(([query]) => query.cursor)).toEqual([
      undefined,
      'next',
      'next',
    ])
  })

  it('passes a read failure on', async () => {
    const failure = new IndexerReadError({
      message: 'unavailable',
      kind: 'unavailable',
      cause: new Error('bigname unavailable'),
    })

    const result = await hasDashboardNames(
      vi.fn<ReadNamesForAddress>(() => errAsync(failure)),
      ADDRESS,
    )

    expect(result._unsafeUnwrapErr()).toBe(failure)
  })
})
