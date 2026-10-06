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
  fetchStageNames,
  MAX_PAGES_PER_SOURCE,
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

describe('fetchStageNames', () => {
  beforeEach(() => {
    vi.mocked(fetchExpiringNamesPage).mockReset()
    vi.mocked(isStaleCursorError).mockReset()
  })

  it('reads an expiry stage once, over every authority, at the registrar expiry', async () => {
    vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(
      okAsync(page([named('a.eth', 150, 'v1'), named('b.eth', 160)])),
    )

    const result = await fetchStageNames({
      env: ENV,
      stage: stage('expiry-30d'),
      cursor: 100,
      upperBound: 200,
    })

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(1)
    expect(fetchExpiringNamesPage).toHaveBeenCalledWith({
      env: ENV,
      stageId: 'expiry-30d',
      expiresFrom: 101,
      expiresTo: 200,
    })
    expect(result._unsafeUnwrap()).toEqual({
      domains: [
        { ...named('a.eth', 150, 'v1'), position: 150 },
        { ...named('b.eth', 160), position: 160 },
      ],
      cursorEnd: 160,
      hasMore: false,
      indexedAtSec: INDEXED_AT,
    })
  })

  it('reads a grace-end stage per protocol, with ENSv1 moved back by the grace difference', async () => {
    const cursor = 10_000_000
    const upperBound = cursor + 100
    vi.mocked(fetchExpiringNamesPage)
      .mockReturnValueOnce(okAsync(page([named('v2.eth', cursor + 50)])))
      .mockReturnValueOnce(
        okAsync(page([named('v1.eth', cursor + 20 - V1_SHIFT, 'v1')])),
      )

    const result = await fetchStageNames({
      env: ENV,
      stage: stage('premium-start'),
      cursor,
      upperBound,
    })

    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(1, {
      env: ENV,
      stageId: 'premium-start',
      expiresFrom: cursor + 1,
      expiresTo: upperBound,
      authorities: ['ens_v2'],
    })
    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(2, {
      env: ENV,
      stageId: 'premium-start',
      expiresFrom: cursor + 1 - V1_SHIFT,
      expiresTo: upperBound - V1_SHIFT,
      authorities: ['ens_v0', 'ens_v1'],
    })
    const read = result._unsafeUnwrap()
    expect(read.domains.map(({ name, position }) => [name, position])).toEqual([
      ['v1.eth', cursor + 20],
      ['v2.eth', cursor + 50],
    ])
    expect(read.domains[0]?.expiryDate).toBe(cursor + 20 - V1_SHIFT)
    expect(read.cursorEnd).toBe(cursor + 50)
  })

  it('leaves the cursor where it was when the window is empty', async () => {
    vi.mocked(fetchExpiringNamesPage).mockReturnValue(okAsync(page([])))

    const result = await fetchStageNames({
      env: ENV,
      stage: stage('expiry-7d'),
      cursor: 100,
      upperBound: 200,
    })

    expect(result._unsafeUnwrap().cursorEnd).toBe(100)
  })

  it('follows the cursor across pages and reports the oldest index position', async () => {
    vi.mocked(fetchExpiringNamesPage)
      .mockReturnValueOnce(okAsync(page([named('a.eth', 110)], 'c1')))
      .mockReturnValueOnce(
        okAsync(page([named('b.eth', 120)], null, INDEXED_AT - 30)),
      )

    const result = await fetchStageNames({
      env: ENV,
      stage: stage('expiry-30d'),
      cursor: 100,
      upperBound: 200,
    })

    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageCursor: 'c1' }),
    )
    const read = result._unsafeUnwrap()
    expect(read.domains.map(({ name }) => name)).toEqual(['a.eth', 'b.eth'])
    expect(read.indexedAtSec).toBe(INDEXED_AT - 30)
    expect(read.hasMore).toBe(false)
  })

  it('stops just before the second a source was reading when it runs out of pages', async () => {
    const pages = Array.from({ length: MAX_PAGES_PER_SOURCE }, (_, read) =>
      page(fullPageAt(110 + read, `p${read}`), `c${read + 1}`),
    )
    for (const value of pages) {
      vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(okAsync(value))
    }

    const result = await fetchStageNames({
      env: ENV,
      stage: stage('expiry-30d'),
      cursor: 100,
      upperBound: 200,
    })

    const lastSecond = 110 + MAX_PAGES_PER_SOURCE - 1
    const read = result._unsafeUnwrap()
    expect(read.cursorEnd).toBe(lastSecond - 1)
    expect(read.hasMore).toBe(true)
    expect(read.overflow).toBeUndefined()
    expect(read.domains.every(({ position }) => position < lastSecond)).toBe(
      true,
    )
    expect(read.domains).toHaveLength(PAGE_SIZE * (MAX_PAGES_PER_SOURCE - 1))
  })

  it('moves past one second that fills the page budget and reports the overflow', async () => {
    for (let read = 0; read < MAX_PAGES_PER_SOURCE; read++) {
      vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(
        okAsync(page(fullPageAt(101, `p${read}`), `c${read + 1}`)),
      )
    }

    const result = await fetchStageNames({
      env: ENV,
      stage: stage('expiry-30d'),
      cursor: 100,
      upperBound: 200,
    })

    const read = result._unsafeUnwrap()
    expect(read.cursorEnd).toBe(101)
    expect(read.domains).toHaveLength(PAGE_SIZE * MAX_PAGES_PER_SOURCE)
    expect(read.overflow).toEqual({
      expiryTimestamp: 101,
      processedCount: PAGE_SIZE * MAX_PAGES_PER_SOURCE,
    })
  })

  it.each([
    {
      label: 're-reads a source once when its cursor goes stale',
      isStale: true,
    },
    { label: 'fails on any other error', isStale: false },
  ])('$label', async ({ isStale }) => {
    const failure = new IndexerRequestError({ message: 'rejected', attempt: 1 })
    vi.mocked(isStaleCursorError).mockReturnValue(isStale)
    vi.mocked(fetchExpiringNamesPage)
      .mockReturnValueOnce(okAsync(page([named('a.eth', 110)], 'c1')))
      .mockReturnValueOnce(errAsync(failure))
      .mockReturnValueOnce(
        okAsync(page([named('a.eth', 110), named('b.eth', 120)])),
      )

    const result = await fetchStageNames({
      env: ENV,
      stage: stage('expiry-30d'),
      cursor: 100,
      upperBound: 200,
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
    expect(result._unsafeUnwrap().domains.map(({ name }) => name)).toEqual([
      'a.eth',
      'b.eth',
    ])
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

    const result = await fetchStageNames({
      env: ENV,
      stage: stage(id),
      cursor: 10_000_000,
      upperBound: 10_000_100,
    })

    expect([
      ...new Set(result._unsafeUnwrap().domains.map(({ name }) => name)),
    ]).toEqual(kept)
  })

  it('stops at the last row read even when every row on the page was dropped', async () => {
    for (let read = 0; read < MAX_PAGES_PER_SOURCE; read++) {
      vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(
        okAsync(
          page(
            Array.from({ length: PAGE_SIZE }, (_, index) =>
              named(`r${read}-${index}.eth`, 110 + read, 'v2', true),
            ),
            `c${read + 1}`,
          ),
        ),
      )
    }

    const result = await fetchStageNames({
      env: ENV,
      stage: stage('expiry-30d'),
      cursor: 100,
      upperBound: 200,
    })

    const read = result._unsafeUnwrap()
    expect(read.domains).toEqual([])
    expect(read.cursorEnd).toBe(110 + MAX_PAGES_PER_SOURCE - 2)
  })
})
