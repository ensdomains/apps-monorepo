import { errAsync, okAsync } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from './common.types'
import { IndexerReadError } from './errors'
import type { NameSummary, ReadNamesForAddress } from './namesForAddress.types'
import { readAllNames } from './paging'

const ADDRESS = '0x0000000000000000000000000000000000000abc'

const summary = (name: string): NameSummary => ({
  name,
  displayName: name,
  namehash: '0x01',
  protocol: 'v2',
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
  names: readonly string[],
  nextCursor: string | null = null,
): Page<NameSummary> => ({
  items: names.map(summary),
  nextCursor,
  totalCount: null,
})

const failure = (kind: IndexerReadError['kind']) =>
  new IndexerReadError({ message: kind, kind, cause: new Error(kind) })

/** Runs the stale backoff on fake timers instead of waiting it out. */
const settle = async <T>(result: PromiseLike<T>): Promise<T> => {
  const settled = Promise.resolve(result)
  await vi.runAllTimersAsync()
  return settled
}

describe('readAllNames', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reads every page in order', async () => {
    const readNames = vi
      .fn<ReadNamesForAddress>()
      .mockReturnValueOnce(okAsync(page(['a.eth'], 'next')))
      .mockReturnValueOnce(okAsync(page(['b.eth'])))

    const result = await settle(readAllNames(readNames, { address: ADDRESS }))

    expect(result._unsafeUnwrap().map(({ name }) => name)).toEqual([
      'a.eth',
      'b.eth',
    ])
    expect(readNames).toHaveBeenNthCalledWith(
      2,
      { address: ADDRESS, pageSize: 200, cursor: 'next' },
      { signal: undefined },
    )
  })

  it('retries a stale page with the same cursor instead of losing the read', async () => {
    const readNames = vi
      .fn<ReadNamesForAddress>()
      .mockReturnValueOnce(okAsync(page(['a.eth'], 'next')))
      .mockReturnValueOnce(errAsync(failure('stale')))
      .mockReturnValueOnce(okAsync(page(['b.eth'])))

    const result = await settle(readAllNames(readNames, { address: ADDRESS }))

    expect(result._unsafeUnwrap()).toHaveLength(2)
    expect(readNames.mock.calls.map(([query]) => query.cursor)).toEqual([
      undefined,
      'next',
      'next',
    ])
  })

  it.each([
    { case: 'a page that stays stale', kind: 'stale' as const, calls: 3 },
    { case: 'any other failure', kind: 'unavailable' as const, calls: 1 },
  ])('fails on $case', async ({ kind, calls }) => {
    const readNames = vi
      .fn<ReadNamesForAddress>()
      .mockReturnValue(errAsync(failure(kind)))

    const result = await settle(readAllNames(readNames, { address: ADDRESS }))

    expect(result._unsafeUnwrapErr().kind).toBe(kind)
    expect(readNames).toHaveBeenCalledTimes(calls)
  })
})
