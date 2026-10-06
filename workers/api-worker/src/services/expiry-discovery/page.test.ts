import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./indexer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./indexer.js')>()),
  fetchExpiringNamesPage: vi.fn(),
  isStaleCursorError: vi.fn(),
}))

import {
  type ExpiringName,
  type ExpiringNamesPage,
  fetchExpiringNamesPage,
  IndexerRequestError,
  isStaleCursorError,
  PAGE_SIZE,
} from './indexer.js'
import {
  fetchSweep,
  MAX_PAGES_PER_SOURCE,
  mergeWindows,
  type StageWindow,
  sourcesForStage,
} from './page.js'
import { GRACE_END_SHIFT_SECONDS, STAGES } from './stages.js'

const ENV = {} as CloudflareBindings
const INDEXED_AT = 1_700_000_000
const V1_SHIFT = GRACE_END_SHIFT_SECONDS.v1

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

const named = (
  name: string,
  expiryDate: number,
  protocol: ExpiringName['protocol'] = 'v2',
  isReleased = false,
): ExpiringName => ({ name, expiryDate, protocol, isReleased })

const page = (
  names: readonly ExpiringName[],
  nextCursor: string | null = null,
  indexedAtSec = INDEXED_AT,
): ExpiringNamesPage => ({ names, nextCursor, indexedAtSec })

const fullPageAt = (expiryDate: number, prefix: string) =>
  Array.from({ length: PAGE_SIZE }, (_, index) =>
    named(`${prefix}-${index}.eth`, expiryDate),
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

describe('sourcesForStage', () => {
  it.each(
    STAGES.map((value) => ({
      id: value.id,
      value,
      count: value.anchor === 'expiry' ? 1 : 2,
    })),
  )('reads $count source(s) for $id', ({ value, count }) => {
    expect(sourcesForStage(value)).toHaveLength(count)
  })
})

describe('fetchSweep', () => {
  beforeEach(() => {
    vi.mocked(fetchExpiringNamesPage).mockReset()
    vi.mocked(isStaleCursorError).mockReset()
  })

  it('reads the expiry stages once over the union of their windows and splits the rows by stage', async () => {
    vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(
      okAsync(
        page([
          named('one-day.eth', 150, 'v1'),
          named('seven-day.eth', 250),
          named('thirty-day.eth', 350),
        ]),
      ),
    )

    const result = await fetchSweep({
      env: ENV,
      windows: [
        window('expiry-1d', 100, 200),
        window('expiry-7d', 200, 300),
        window('expiry-30d', 300, 400),
      ],
    })

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(1)
    expect(fetchExpiringNamesPage).toHaveBeenCalledWith(
      expect.objectContaining({ expiresFrom: 101, expiresTo: 400 }),
    )
    expect(
      vi.mocked(fetchExpiringNamesPage).mock.calls[0]?.[0],
    ).not.toHaveProperty('authorities')
    expect(namesOf(result, 'expiry-1d')).toEqual(['one-day.eth'])
    expect(namesOf(result, 'expiry-7d')).toEqual(['seven-day.eth'])
    expect(namesOf(result, 'expiry-30d')).toEqual(['thirty-day.eth'])
    expect(result._unsafeUnwrap().pages.get('expiry-7d')?.cursorEnd).toBe(300)
  })

  it('reads grace-end stages per protocol, with ENSv1 moved back by the grace difference', async () => {
    const cursor = 10_000_000
    vi.mocked(fetchExpiringNamesPage)
      .mockReturnValueOnce(okAsync(page([named('v2.eth', cursor + 50)])))
      .mockReturnValueOnce(
        okAsync(page([named('v1.eth', cursor + 20 - V1_SHIFT, 'v1')])),
      )

    const result = await fetchSweep({
      env: ENV,
      windows: [window('premium-start', cursor, cursor + 100)],
    })

    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        expiresFrom: cursor + 1,
        expiresTo: cursor + 100,
        authorities: ['ens_v2'],
      }),
    )
    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        expiresFrom: cursor + 1 - V1_SHIFT,
        expiresTo: cursor + 100 - V1_SHIFT,
        authorities: ['ens_v0', 'ens_v1'],
      }),
    )
    const read = result._unsafeUnwrap().pages.get('premium-start')
    expect(read?.domains.map(({ name, position }) => [name, position])).toEqual(
      [
        ['v1.eth', cursor + 20],
        ['v2.eth', cursor + 50],
      ],
    )
    expect(read?.domains[0]?.expiryDate).toBe(cursor + 20 - V1_SHIFT)
  })

  it('reads windows that do not touch separately, so processed names are not read again', async () => {
    vi.mocked(fetchExpiringNamesPage).mockReturnValue(okAsync(page([])))

    await fetchSweep({
      env: ENV,
      windows: [window('expiry-1d', 100, 200), window('expiry-30d', 900, 1000)],
    })

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(2)
    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expiresFrom: 901, expiresTo: 1000 }),
    )
  })

  it('moves an empty window to its end', async () => {
    vi.mocked(fetchExpiringNamesPage).mockReturnValue(okAsync(page([])))

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

  it.each([
    { id: 'premium-start', kept: ['live.eth', 'released.eth'] },
    { id: 'grace-1d', kept: ['live.eth'] },
  ] as const)('keeps released names only where they belong: $id', async ({
    id,
    kept,
  }) => {
    vi.mocked(fetchExpiringNamesPage).mockReturnValue(
      okAsync(
        page([
          named('live.eth', 10_000_050),
          named('released.eth', 10_000_060, 'v2', true),
        ]),
      ),
    )

    const result = await fetchSweep({
      env: ENV,
      windows: [window(id, 10_000_000, 10_000_100)],
    })

    expect([...new Set(namesOf(result, id))]).toEqual(kept)
  })

  it('moves past released rows it dropped at the end of a complete window', async () => {
    vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(
      okAsync(
        page([named('live.eth', 120), named('released.eth', 150, 'v2', true)]),
      ),
    )

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-30d', 100, 200)],
    })

    const read = result._unsafeUnwrap().pages.get('expiry-30d')
    expect(read?.domains.map(({ name }) => name)).toEqual(['live.eth'])
    expect(read?.cursorEnd).toBe(200)
  })

  it('stops the window it ran out of pages in, and leaves later windows for next run', async () => {
    for (let read = 0; read < MAX_PAGES_PER_SOURCE; read++) {
      vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(
        okAsync(page(fullPageAt(110 + read, `p${read}`), `c${read + 1}`)),
      )
    }

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-1d', 100, 200), window('expiry-7d', 200, 300)],
    })

    const lastSecond = 110 + MAX_PAGES_PER_SOURCE - 1
    const first = result._unsafeUnwrap().pages.get('expiry-1d')
    expect(first?.cursorEnd).toBe(lastSecond - 1)
    expect(first?.hasMore).toBe(true)
    expect(first?.domains).toHaveLength(PAGE_SIZE * (MAX_PAGES_PER_SOURCE - 1))
    expect(result._unsafeUnwrap().pages.get('expiry-7d')).toEqual({
      domains: [],
      cursorEnd: 200,
      hasMore: true,
    })
  })

  it('moves past one second that fills the page budget and reports the overflow', async () => {
    for (let read = 0; read < MAX_PAGES_PER_SOURCE; read++) {
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
      processedCount: PAGE_SIZE * MAX_PAGES_PER_SOURCE,
    })
  })

  it('reports the oldest index position across reads', async () => {
    vi.mocked(fetchExpiringNamesPage)
      .mockReturnValueOnce(okAsync(page([], null, INDEXED_AT)))
      .mockReturnValueOnce(okAsync(page([], null, INDEXED_AT - 30)))
      .mockReturnValueOnce(okAsync(page([], null, INDEXED_AT - 10)))

    const result = await fetchSweep({
      env: ENV,
      windows: [
        window('expiry-1d', 100, 200),
        window('grace-1d', 10_000_000, 10_000_100),
      ],
    })

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(3)
    expect(result._unsafeUnwrap().indexedAtSec).toBe(INDEXED_AT - 30)
  })

  it.each([
    {
      label: 're-reads a source once when its cursor goes stale',
      isStale: true,
    },
    { label: 'fails on any other error', isStale: false },
  ])('$label', async ({ isStale }) => {
    const failure = new IndexerRequestError({
      message: 'rejected',
      cause: new Error('rejected'),
      attempt: 1,
    })
    vi.mocked(isStaleCursorError).mockReturnValue(isStale)
    vi.mocked(fetchExpiringNamesPage)
      .mockReturnValueOnce(okAsync(page([named('a.eth', 110)], 'c1')))
      .mockReturnValueOnce(errAsync(failure))
      .mockReturnValueOnce(
        okAsync(page([named('a.eth', 110), named('b.eth', 120)])),
      )

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-30d', 100, 200)],
    })

    if (!isStale) {
      expect(result._unsafeUnwrapErr()).toBe(failure)
      return
    }
    // The partial read before the stale page is dropped, not duplicated.
    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(
      3,
      expect.not.objectContaining({ pageCursor: expect.anything() }),
    )
    expect(namesOf(result, 'expiry-30d')).toEqual(['a.eth', 'b.eth'])
  })
})
