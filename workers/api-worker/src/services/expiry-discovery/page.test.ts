import { okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./indexer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./indexer.js')>()),
  fetchExpiringNamesPage: vi.fn(),
}))

import {
  fetchExpiringNamesPage,
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
      [
        ...uniqueDomains(PROCESS_PAGE_SIZE - 1),
        ...domainsAt(2, 10_000),
      ],
      50,
    )
    expect(plan.type).toBe('split-timestamp')
    if (plan.type !== 'split-timestamp') return
    expect(plan.timestamp).toBe(10_000)
    expect(plan.domainsBeforeTimestamp).toHaveLength(PROCESS_PAGE_SIZE - 1)
  })

  it('processes a bounded exact timestamp bucket and reports overflow', () => {
    const fitting = planExactTimestampPage(domainsAt(500, 10_000), 10_000)
    expect(fitting.domains).toHaveLength(500)
    expect(fitting.overflow).toBe(false)

    const overflow = planExactTimestampPage(
      domainsAt(QUERY_PAGE_SIZE, 10_000),
      10_000,
    )
    expect(overflow.domains).toHaveLength(QUERY_PAGE_SIZE)
    expect(overflow.overflow).toBe(true)
    expect(overflow.cursorEnd).toBe(10_000)
  })

  it.each([
    { exactCount: 2, expectedOverflow: false },
    { exactCount: QUERY_PAGE_SIZE, expectedOverflow: true },
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
    const stage = STAGES[0]
    if (!stage) throw new Error('Expected an expiry stage')
    const result = await fetchProcessableExpiringNames({
      env,
      stage,
      cursor: 50,
      upperBound: 20_000,
    })

    expect(fetchExpiringNamesPage).toHaveBeenCalledTimes(2)
    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(1, {
      env,
      stage,
      cursor: 50,
      upperBound: 20_000,
    })
    expect(fetchExpiringNamesPage).toHaveBeenNthCalledWith(2, {
      env,
      stage,
      cursor: timestamp - 1,
      upperBound: timestamp,
    })
    expect(result._unsafeUnwrap()).toEqual({
      domains: [
        ...beforeTimestamp,
        ...exactDomains.slice(0, QUERY_PAGE_SIZE),
      ],
      cursorEnd: timestamp,
      hasMore: true,
      overflow: expectedOverflow
        ? { expiryTimestamp: timestamp, processedCount: QUERY_PAGE_SIZE }
        : undefined,
    })
  })
})
