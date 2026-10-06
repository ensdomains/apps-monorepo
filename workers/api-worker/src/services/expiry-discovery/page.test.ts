import { okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./indexer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./indexer.js')>()),
  fetchExpiringNamesPage: vi.fn(),
}))

import {
  EXACT_TIMESTAMP_MAX_ROWS,
  type ExpiringDomain,
  fetchExpiringNamesPage,
  PROCESS_PAGE_SIZE,
  QUERY_PAGE_SIZE,
} from './indexer.js'
import {
  fetchProcessableExpiringNames,
  planExactTimestampPage,
  planNormalExpiryPage,
} from './page.js'
import { TRACKS } from './stages.js'

const domain = (name: string, expiryDate: number): ExpiringDomain => ({
  name,
  expiryDate,
  inTrack: true,
  registrationStatus: 'active',
})
const uniqueDomains = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    domain(`${index}.eth`, 100 + index),
  )
const domainsAt = (count: number, expiryDate: number) =>
  Array.from({ length: count }, (_, index) =>
    domain(`tied-${index}.eth`, expiryDate),
  )

describe('expiry page planning', () => {
  beforeEach(() => vi.mocked(fetchExpiringNamesPage).mockReset())

  it.each([
    250,
    PROCESS_PAGE_SIZE,
  ])('completes a normal page of %i rows', (count) => {
    const plan = planNormalExpiryPage(uniqueDomains(count), 50)
    expect(plan.type).toBe('complete')
    if (plan.type !== 'complete') return
    expect(plan.domains).toHaveLength(count)
    expect(plan.hasMore).toBe(false)
  })

  it('uses a unique lookahead as a safe cursor boundary', () => {
    const plan = planNormalExpiryPage(uniqueDomains(QUERY_PAGE_SIZE), 50)
    expect(plan.type).toBe('safe-boundary')
    if (plan.type !== 'safe-boundary') return
    expect(plan.domains).toHaveLength(PROCESS_PAGE_SIZE)
    expect(plan.cursorEnd).toBe(100 + PROCESS_PAGE_SIZE - 1)
    expect(plan.hasMore).toBe(true)
  })

  it('detects a timestamp split at the process boundary', () => {
    const plan = planNormalExpiryPage(
      [...uniqueDomains(PROCESS_PAGE_SIZE - 1), ...domainsAt(2, 10_000)],
      50,
    )
    expect(plan.type).toBe('split-timestamp')
    if (plan.type !== 'split-timestamp') return
    expect(plan.timestamp).toBe(10_000)
    expect(plan.domainsBeforeTimestamp).toHaveLength(PROCESS_PAGE_SIZE - 1)
  })

  it('processes a whole exact timestamp bucket and reports overflow only when more remain', () => {
    const fitting = planExactTimestampPage(
      domainsAt(QUERY_PAGE_SIZE + 500, 10_000),
      10_000,
      false,
    )
    expect(fitting.domains).toHaveLength(QUERY_PAGE_SIZE + 500)
    expect(fitting.overflow).toBe(false)

    const overflow = planExactTimestampPage(
      domainsAt(EXACT_TIMESTAMP_MAX_ROWS, 10_000),
      10_000,
      true,
    )
    expect(overflow.domains).toHaveLength(EXACT_TIMESTAMP_MAX_ROWS)
    expect(overflow.overflow).toBe(true)
    expect(overflow.cursorEnd).toBe(10_000)
  })

  it.each([
    { exactCount: 2, expectedOverflow: false },
    { exactCount: QUERY_PAGE_SIZE + 1, expectedOverflow: false },
    { exactCount: EXACT_TIMESTAMP_MAX_ROWS, expectedOverflow: true },
  ])('re-queries a split timestamp with $exactCount exact rows', async ({
    exactCount,
    expectedOverflow,
  }) => {
    const timestamp = 10_000
    const beforeTimestamp = uniqueDomains(PROCESS_PAGE_SIZE - 1)
    const exactDomains = domainsAt(exactCount, timestamp)
    vi.mocked(fetchExpiringNamesPage)
      .mockReturnValueOnce(
        okAsync({
          domains: [...beforeTimestamp, ...exactDomains.slice(0, 2)],
          hasMore: true,
        }),
      )
      .mockReturnValueOnce(
        okAsync({ domains: exactDomains, hasMore: expectedOverflow }),
      )

    const env = {} as CloudflareBindings
    const track = TRACKS[0]
    const stage = track?.stages[0]
    if (!stage || !track) throw new Error('Expected an expiry stage and track')
    const result = await fetchProcessableExpiringNames({
      env,
      track,
      stage,
      cursor: 50,
      upperBound: 20_000,
    })

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(2)
    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(1, {
      env,
      track,
      stage,
      cursor: 50,
      upperBound: 20_000,
    })
    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(2, {
      env,
      track,
      stage,
      cursor: timestamp - 1,
      upperBound: timestamp,
      maxRows: EXACT_TIMESTAMP_MAX_ROWS,
    })
    expect(result._unsafeUnwrap()).toEqual({
      domains: [...beforeTimestamp, ...exactDomains],
      cursorEnd: timestamp,
      hasMore: true,
      overflow: expectedOverflow
        ? { expiryTimestamp: timestamp, processedCount: exactCount }
        : undefined,
    })
  })

  it('recovers a split second from a batched stage without refetching its normal window', async () => {
    const timestamp = 10_000
    const beforeTimestamp = uniqueDomains(PROCESS_PAGE_SIZE - 1)
    const exactDomains = domainsAt(3, timestamp)
    vi.mocked(fetchExpiringNamesPage).mockReturnValue(
      okAsync({ domains: exactDomains, hasMore: false }),
    )
    const track = TRACKS[0]
    const stage = track?.stages[0]
    if (!track || !stage) throw new Error('Missing expiry stage')
    const result = await fetchProcessableExpiringNames({
      env: {} as CloudflareBindings,
      track,
      stage,
      cursor: 50,
      upperBound: 20_000,
      page: {
        domains: [...beforeTimestamp, ...exactDomains.slice(0, 2)],
        hasMore: true,
      },
    })
    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(1)
    expect(fetchExpiringNamesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: timestamp - 1,
        upperBound: timestamp,
        maxRows: EXACT_TIMESTAMP_MAX_ROWS,
      }),
    )
    expect(result._unsafeUnwrap().domains).toEqual([
      ...beforeTimestamp,
      ...exactDomains,
    ])
    expect(result._unsafeUnwrap().cursorEnd).toBe(timestamp)
  })
})
