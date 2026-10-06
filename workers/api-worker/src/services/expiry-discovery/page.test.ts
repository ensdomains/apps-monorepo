import { okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./indexer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./indexer.js')>()),
  fetchExpiringNamesPage: vi.fn(),
}))

import {
  fetchExpiringNamesPage,
  MAX_EXACT_TIMESTAMP_PAGES,
  PROCESS_PAGE_SIZE,
  QUERY_PAGE_SIZE,
} from './indexer.js'
import {
  fetchProcessableExpiringNames,
  planExactTimestampPage,
  planNormalExpiryPage,
} from './page.js'
import { STAGES } from './stages.js'

const uniqueDomains = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    name: `${index}.eth`,
    expiryDate: 100 + index,
  }))
const domainsAt = (count: number, expiryDate: number) =>
  Array.from({ length: count }, (_, index) => ({
    name: `tied-${index}.eth`,
    expiryDate,
  }))

describe('expiry page planning', () => {
  beforeEach(() => vi.mocked(fetchExpiringNamesPage).mockReset())

  it.each([
    50,
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

  it('reports overflow only while rows are left at the timestamp', () => {
    const domains = domainsAt(3, 10_000)
    expect(planExactTimestampPage(domains, 10_000, false)).toEqual({
      domains,
      overflow: false,
      cursorEnd: 10_000,
    })
    expect(planExactTimestampPage(domains, 10_000, true).overflow).toBe(true)
  })

  it.each([
    { label: 'one page', exactPages: [2], cursorsLeft: false },
    {
      label: 'several pages',
      exactPages: [QUERY_PAGE_SIZE, QUERY_PAGE_SIZE, 50],
      cursorsLeft: false,
    },
    {
      label: 'more pages than the limit',
      exactPages: Array.from(
        { length: MAX_EXACT_TIMESTAMP_PAGES },
        () => QUERY_PAGE_SIZE,
      ),
      cursorsLeft: true,
    },
  ])('pages a split timestamp with the cursor across $label', async ({
    exactPages,
    cursorsLeft,
  }) => {
    const timestamp = 10_000
    const beforeTimestamp = uniqueDomains(PROCESS_PAGE_SIZE - 1)
    const exactDomains = exactPages.map((count, read) =>
      domainsAt(count, timestamp).map((domain, index) => ({
        ...domain,
        name: `${read}-${index}.eth`,
      })),
    )
    const mock = vi.mocked(fetchExpiringNamesPage).mockReturnValueOnce(
      okAsync({
        domains: [...beforeTimestamp, ...domainsAt(2, timestamp)],
        hasMore: true,
        nextCursor: null,
        indexedAtSec: 1_700_000_000,
      }),
    )
    for (const [read, domains] of exactDomains.entries()) {
      const isLast = read === exactDomains.length - 1
      mock.mockReturnValueOnce(
        okAsync({
          domains,
          hasMore: domains.length === QUERY_PAGE_SIZE,
          nextCursor: isLast && !cursorsLeft ? null : `c${read + 1}`,
          indexedAtSec: 1_700_000_000 - read,
        }),
      )
    }

    const env = {} as CloudflareBindings
    const stage = STAGES[0]
    if (!stage) throw new Error('Expected an expiry stage')
    const result = await fetchProcessableExpiringNames({
      env,
      stage,
      cursor: 50,
      upperBound: 20_000,
    })

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(exactPages.length + 1)
    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(2, {
      env,
      stage,
      cursor: timestamp - 1,
      upperBound: timestamp,
    })
    if (exactPages.length > 1) {
      expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(3, {
        env,
        stage,
        cursor: timestamp - 1,
        upperBound: timestamp,
        pageCursor: 'c1',
      })
    }
    const processed = exactDomains.flat()
    expect(result._unsafeUnwrap()).toEqual({
      domains: [...beforeTimestamp, ...processed],
      cursorEnd: timestamp,
      hasMore: true,
      indexedAtSec: 1_700_000_000 - (exactPages.length - 1),
      overflow: cursorsLeft
        ? { expiryTimestamp: timestamp, processedCount: processed.length }
        : undefined,
    })
  })
})
