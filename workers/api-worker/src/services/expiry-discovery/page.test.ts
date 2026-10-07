import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./indexer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./indexer.js')>()),
  fetchExpiringNamesPage: vi.fn(),
}))

import {
  type ExpiringName,
  type ExpiringNamesPage,
  type ExpiringNamesQuery,
  fetchExpiringNamesPage,
  IndexerRequestError,
  PAGE_SIZE,
} from './indexer.js'
import {
  fetchSweep,
  MAX_PAGES_PER_READ,
  mergeWindows,
  type StageWindow,
} from './page.js'
import { STAGES } from './stages.js'

const ENV = {} as CloudflareBindings
const INDEXED_AT = 1_700_000_000

const stage = (id: (typeof STAGES)[number]['id']) => {
  const value = STAGES.find((candidate) => candidate.id === id)
  if (!value) throw new Error(`Missing stage: ${id}`)
  return value
}

const window = (
  id: (typeof STAGES)[number]['id'],
  cursor: number,
  upperBound: number,
): StageWindow => ({ stage: stage(id), cursor, upperBound })

const held = (name: string, expiryDate: number): ExpiringName => ({
  name,
  expiryDate,
  registrationStatus: 'registered',
})

/** An ENSv2 registration past its expiry, still renewable in grace. */
const expiredRelease = (name: string, expiryDate: number): ExpiringName => ({
  name,
  expiryDate,
  registrationStatus: 'released',
  releaseKind: 'expired',
})

const page = (
  names: readonly ExpiringName[],
  nextCursor: string | null = null,
  indexedAtSec = INDEXED_AT,
): ExpiringNamesPage => ({ names, nextCursor, indexedAtSec })

/** Answers a read as bigname would: every row inside one of its windows. */
const serveIndex = (names: readonly ExpiringName[]) =>
  vi
    .mocked(fetchExpiringNamesPage)
    .mockImplementation((query: ExpiringNamesQuery) =>
      okAsync(
        page(
          names
            .filter(({ expiryDate }) =>
              query.windows.some(
                ({ from, to }) => expiryDate >= from && expiryDate <= to,
              ),
            )
            .toSorted((left, right) => left.expiryDate - right.expiryDate),
        ),
      ),
    )

const fullPageAt = (expiryDate: number, prefix: string) =>
  Array.from({ length: PAGE_SIZE }, (_, index) =>
    held(`${prefix}-${index}.eth`, expiryDate),
  )

const namesOf = (
  result: Awaited<ReturnType<typeof fetchSweep>>,
  id: (typeof STAGES)[number]['id'],
) =>
  result
    ._unsafeUnwrap()
    .pages.get(id)
    ?.domains.map(({ name }) => name)

describe('mergeWindows', () => {
  it('joins windows that overlap or touch and keeps the rest apart', () => {
    expect(
      mergeWindows([
        window('expiry-7d', 200, 300),
        window('expiry-1d', 100, 200),
        window('expiry-30d', 900, 1000),
      ]),
    ).toEqual([
      { from: 100, to: 300 },
      { from: 900, to: 1000 },
    ])
  })
})

describe('fetchSweep', () => {
  beforeEach(() => {
    vi.mocked(fetchExpiringNamesPage).mockReset()
    vi.mocked(fetchExpiringNamesPage).mockReturnValue(okAsync(page([])))
  })

  it('reads every open stage window in one multi-window walk and splits the rows by stage', async () => {
    serveIndex([
      held('one-day.eth', 150),
      held('thirty-day.eth', 950),
      held('between.eth', 500),
    ])

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-1d', 100, 200), window('expiry-30d', 900, 1000)],
    })

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(1)
    expect(fetchExpiringNamesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        windows: [
          { from: 101, to: 200 },
          { from: 901, to: 1000 },
        ],
      }),
    )
    expect(namesOf(result, 'expiry-1d')).toEqual(['one-day.eth'])
    expect(namesOf(result, 'expiry-30d')).toEqual(['thirty-day.eth'])
  })

  it('places a name exactly at the window end inside it, so no boundary is skipped', async () => {
    serveIndex([held('edge.eth', 200), held('next.eth', 201)])

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-30d', 100, 200)],
    })

    expect(namesOf(result, 'expiry-30d')).toEqual(['edge.eth'])
    expect(result._unsafeUnwrap().pages.get('expiry-30d')?.cursorEnd).toBe(200)
  })

  it.each([
    { id: 'expiry-7d', kept: ['held.eth'] },
    { id: 'grace-1d', kept: ['held.eth', 'expired.eth'] },
    { id: 'premium-start', kept: ['expired.eth'] },
  ] as const)('notifies the rows each phase allows: $id', async ({
    id,
    kept,
  }) => {
    serveIndex([
      held('held.eth', 10_000_050),
      expiredRelease('expired.eth', 10_000_060),
      {
        name: 'unregistered.eth',
        expiryDate: 10_000_070,
        registrationStatus: 'released',
        releaseKind: 'unregistered',
      },
      {
        name: 'never.eth',
        expiryDate: 10_000_080,
        registrationStatus: 'unregistered',
      },
    ])

    const result = await fetchSweep({
      env: ENV,
      windows: [window(id, 10_000_000, 10_000_100)],
    })

    expect(namesOf(result, id)).toEqual(kept)
  })

  it('moves an empty window to its end', async () => {
    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-7d', 100, 200)],
    })

    expect(result._unsafeUnwrap().pages.get('expiry-7d')).toEqual({
      domains: [],
      cursorEnd: 200,
      hasMore: false,
    })
  })

  it('stops the window it ran out of pages in, and leaves later windows for next run', async () => {
    for (let read = 0; read < MAX_PAGES_PER_READ; read++) {
      vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(
        okAsync(page(fullPageAt(110 + read, `p${read}`), `c${read + 1}`)),
      )
    }

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-1d', 100, 200), window('expiry-30d', 900, 1000)],
    })

    const lastSecond = 110 + MAX_PAGES_PER_READ - 1
    const first = result._unsafeUnwrap().pages.get('expiry-1d')
    expect(first?.cursorEnd).toBe(lastSecond - 1)
    expect(first?.hasMore).toBe(true)
    expect(first?.domains).toHaveLength(PAGE_SIZE * (MAX_PAGES_PER_READ - 1))
    expect(result._unsafeUnwrap().pages.get('expiry-30d')).toEqual({
      domains: [],
      cursorEnd: 900,
      hasMore: true,
    })
  })

  it('moves past one second that fills the page budget and reports the overflow', async () => {
    for (let read = 0; read < MAX_PAGES_PER_READ; read++) {
      vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(
        okAsync(page(fullPageAt(101, `p${read}`), `c${read + 1}`)),
      )
    }

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-30d', 100, 200)],
    })

    const read = result._unsafeUnwrap().pages.get('expiry-30d')
    expect(read?.cursorEnd).toBe(101)
    expect(read?.overflow).toEqual({
      expiryTimestamp: 101,
      processedCount: PAGE_SIZE * MAX_PAGES_PER_READ,
    })
  })

  it('reports the oldest index position across pages', async () => {
    vi.mocked(fetchExpiringNamesPage)
      .mockReturnValueOnce(okAsync(page([held('a.eth', 150)], 'c1')))
      .mockReturnValueOnce(okAsync(page([], null, INDEXED_AT - 30)))

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-1d', 100, 200)],
    })

    expect(result._unsafeUnwrap().indexedAtSec).toBe(INDEXED_AT - 30)
  })

  it('fails the sweep when a read fails', async () => {
    const failure = new IndexerRequestError({
      message: 'rejected',
      cause: new Error('rejected'),
      attempt: 1,
    })
    vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(errAsync(failure))

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-30d', 100, 200)],
    })

    expect(result._unsafeUnwrapErr()).toBe(failure)
  })
})
