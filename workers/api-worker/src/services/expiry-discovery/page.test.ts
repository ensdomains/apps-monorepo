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
  MAX_PAGES_PER_SOURCE,
  mergeWindows,
  type StageWindow,
  sourcesForStage,
} from './page.js'
import { GRACE_END_SHIFT_SECONDS, STAGES } from './stages.js'

const ENV = {} as CloudflareBindings
const INDEXED_AT = 1_700_000_000
// A reserved ENSv1 name is listed this long after its lease.
const RESERVATION = GRACE_END_SHIFT_SECONDS.v1

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
  options: {
    readonly protocol?: ExpiringName['protocol']
    readonly isReleased?: boolean
    readonly listedAt?: number
  } = {},
): ExpiringName => ({
  name,
  expiryDate,
  listedAt: options.listedAt ?? expiryDate,
  protocol: options.protocol ?? 'v2',
  isReleased: options.isReleased ?? false,
})

/** An ENSv1 name listed by its ENSv2 reservation. */
const reserved = (name: string, lease: number) =>
  named(name, lease, { protocol: 'v1', listedAt: lease + RESERVATION })

const unreserved = (name: string, lease: number) =>
  named(name, lease, { protocol: 'v1' })

const page = (
  names: readonly ExpiringName[],
  nextCursor: string | null = null,
  indexedAtSec = INDEXED_AT,
): ExpiringNamesPage => ({ names, nextCursor, indexedAtSec })

/** Answers each read as bigname would: by listing date and authority. */
const serveIndex = (names: readonly ExpiringName[]) =>
  vi
    .mocked(fetchExpiringNamesPage)
    .mockImplementation((query: ExpiringNamesQuery) =>
      okAsync(
        page(
          names
            .filter(
              (name) =>
                name.listedAt >= query.expiresFrom &&
                name.listedAt <= query.expiresTo &&
                (!query.authorities ||
                  query.authorities.includes(
                    name.protocol === 'v1' ? 'ens_v1' : 'ens_v2',
                  )),
            )
            .toSorted((left, right) => left.listedAt - right.listedAt),
        ),
      ),
    )

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
    STAGES.map((value) => ({ id: value.id, value })),
  )('reads $id as served and shifted by a reservation', ({ value }) => {
    expect(
      sourcesForStage(value).map(({ listingShiftSec }) => listingShiftSec),
    ).toEqual(value.anchor === 'expiry' ? [0, -RESERVATION] : [0, RESERVATION])
  })
})

describe('fetchSweep', () => {
  beforeEach(() => {
    vi.mocked(fetchExpiringNamesPage).mockReset()
    vi.mocked(fetchExpiringNamesPage).mockReturnValue(okAsync(page([])))
  })

  it('reads the expiry stages once per source over the union of their windows and splits the rows by stage', async () => {
    serveIndex([
      unreserved('one-day.eth', 150),
      named('seven-day.eth', 250),
      named('thirty-day.eth', 350),
    ])

    const result = await fetchSweep({
      env: ENV,
      windows: [
        window('expiry-1d', 100, 200),
        window('expiry-7d', 200, 300),
        window('expiry-30d', 300, 400),
      ],
    })

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(2)
    expect(
      vi
        .mocked(fetchExpiringNamesPage)
        .mock.calls.map(([query]) => [
          query.expiresFrom,
          query.expiresTo,
          query.authorities,
        ]),
    ).toEqual([
      [101, 400, undefined],
      [101 + RESERVATION, 400 + RESERVATION, ['ens_v0', 'ens_v1']],
    ])
    expect(namesOf(result, 'expiry-1d')).toEqual(['one-day.eth'])
    expect(namesOf(result, 'expiry-7d')).toEqual(['seven-day.eth'])
    expect(namesOf(result, 'expiry-30d')).toEqual(['thirty-day.eth'])
    expect(result._unsafeUnwrap().pages.get('expiry-7d')?.cursorEnd).toBe(300)
  })

  it('places every ENSv1 name by its lease on an expiry stage, reserved or not', async () => {
    const cursor = 10_000_000
    serveIndex([
      named('v2.eth', cursor + 10),
      unreserved('unreserved.eth', cursor + 20),
      reserved('reserved.eth', cursor + 30),
      // Listed inside the window, but its lease expired 62 days earlier.
      reserved('lease-earlier.eth', cursor + 40 - RESERVATION),
    ])

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-30d', cursor, cursor + 100)],
    })

    const read = result._unsafeUnwrap().pages.get('expiry-30d')
    expect(
      read?.domains.map(({ name, position, expiryDate }) => [
        name,
        position,
        expiryDate,
      ]),
    ).toEqual([
      ['v2.eth', cursor + 10, cursor + 10],
      ['unreserved.eth', cursor + 20, cursor + 20],
      ['reserved.eth', cursor + 30, cursor + 30],
    ])
  })

  it('places every ENSv1 name by its lease grace on a grace-end stage, reserved or not', async () => {
    const cursor = 10_000_000
    serveIndex([
      named('v2.eth', cursor + 10),
      unreserved('unreserved.eth', cursor + 20 - RESERVATION),
      reserved('reserved.eth', cursor + 30 - RESERVATION),
      // Listed inside the window, but its grace ends 62 days later.
      unreserved('grace-later.eth', cursor + 40),
    ])

    const result = await fetchSweep({
      env: ENV,
      windows: [window('premium-start', cursor, cursor + 100)],
    })

    const read = result._unsafeUnwrap().pages.get('premium-start')
    expect(read?.domains.map(({ name, position }) => [name, position])).toEqual(
      [
        ['v2.eth', cursor + 10],
        ['unreserved.eth', cursor + 20],
        ['reserved.eth', cursor + 30],
      ],
    )
    expect(read?.domains[2]?.expiryDate).toBe(cursor + 30 - RESERVATION)
  })

  it('reads windows that do not touch separately, so processed names are not read again', async () => {
    await fetchSweep({
      env: ENV,
      windows: [window('expiry-1d', 100, 200), window('expiry-30d', 900, 1000)],
    })

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(4)
    expect(fetchExpiringNamesPage).toHaveBeenCalledWith(
      expect.objectContaining({ expiresFrom: 901, expiresTo: 1000 }),
    )
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

  it.each([
    { id: 'premium-start', kept: ['live.eth', 'released.eth'] },
    { id: 'grace-1d', kept: ['live.eth'] },
  ] as const)('keeps released names only where they belong: $id', async ({
    id,
    kept,
  }) => {
    serveIndex([
      named('live.eth', 10_000_050),
      named('released.eth', 10_000_060, { isReleased: true }),
    ])

    const result = await fetchSweep({
      env: ENV,
      windows: [window(id, 10_000_000, 10_000_100)],
    })

    expect(namesOf(result, id)).toEqual(kept)
  })

  it('moves past released rows it dropped at the end of a complete window', async () => {
    serveIndex([
      named('live.eth', 120),
      named('released.eth', 150, { isReleased: true }),
    ])

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

  it('stops at the position a shifted source reached, not its listing date', async () => {
    const cursor = 10_000_000
    vi.mocked(fetchExpiringNamesPage).mockImplementation((query) =>
      okAsync(
        query.authorities
          ? page(
              [reserved('reserved.eth', cursor + 40)],
              // The reserved walk has more after this page and runs out of budget.
              'more',
            )
          : page([]),
      ),
    )

    const result = await fetchSweep({
      env: ENV,
      windows: [window('expiry-30d', cursor, cursor + 100)],
    })

    const read = result._unsafeUnwrap().pages.get('expiry-30d')
    expect(read?.cursorEnd).toBe(cursor + 39)
    expect(read?.hasMore).toBe(true)
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

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(4)
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
