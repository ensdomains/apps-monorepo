import { describe, expect, it } from 'vitest'
import { PROCESS_PAGE_SIZE, QUERY_PAGE_SIZE } from './indexer.js'
import { planExactTimestampPage, planNormalExpiryPage } from './page.js'

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
      [...uniqueDomains(999), ...domainsAt(2, 10_000)],
      50,
    )
    expect(plan.type).toBe('split-timestamp')
    if (plan.type !== 'split-timestamp') return
    expect(plan.timestamp).toBe(10_000)
    expect(plan.domainsBeforeTimestamp).toHaveLength(999)
  })

  it('processes a bounded exact timestamp bucket and reports overflow', () => {
    const fitting = planExactTimestampPage(domainsAt(500, 10_000), 10_000)
    expect(fitting.domains).toHaveLength(500)
    expect(fitting.overflow).toBe(false)

    const overflow = planExactTimestampPage(
      domainsAt(QUERY_PAGE_SIZE, 10_000),
      10_000,
    )
    expect(overflow.domains).toHaveLength(PROCESS_PAGE_SIZE)
    expect(overflow.overflow).toBe(true)
    expect(overflow.cursorEnd).toBe(10_000)
  })
})
