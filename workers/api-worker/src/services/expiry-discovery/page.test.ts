import { describe, expect, it } from 'vitest'
import { PROCESS_PAGE_SIZE, QUERY_PAGE_SIZE } from './indexer.js'
import { planExactTimestampPage, planNormalExpiryPage } from './page.js'

function uniqueDomains(count: number, startExpiry: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix}-${index}.eth`,
    expiryDate: startExpiry + index,
  }))
}

function domainsAt(count: number, expiryDate: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix}-${index}.eth`,
    expiryDate,
  }))
}

describe('planNormalExpiryPage', () => {
  it('treats fewer than PROCESS_PAGE_SIZE rows as a complete page', () => {
    const domains = uniqueDomains(250, 100, 'small')
    const plan = planNormalExpiryPage(domains, 50)

    expect(plan).toEqual({
      type: 'complete',
      domains,
      cursorEnd: 100 + 249,
      hasMore: false,
    })
  })

  it('treats exactly PROCESS_PAGE_SIZE rows as a complete page', () => {
    const domains = uniqueDomains(PROCESS_PAGE_SIZE, 100, 'exact')
    const plan = planNormalExpiryPage(domains, 50)

    expect(plan.type).toBe('complete')
    if (plan.type !== 'complete') return
    expect(plan.domains).toHaveLength(PROCESS_PAGE_SIZE)
    expect(plan.cursorEnd).toBe(100 + PROCESS_PAGE_SIZE - 1)
    expect(plan.hasMore).toBe(false)
  })

  it('uses the query cursor when the page is empty', () => {
    expect(planNormalExpiryPage([], 42)).toEqual({
      type: 'complete',
      domains: [],
      cursorEnd: 42,
      hasMore: false,
    })
  })

  it('keeps the lookahead row unprocessed on a safe unique-timestamp boundary', () => {
    const domains = uniqueDomains(QUERY_PAGE_SIZE, 100, 'unique')
    const plan = planNormalExpiryPage(domains, 50)

    expect(plan.type).toBe('safe-boundary')
    if (plan.type !== 'safe-boundary') return
    expect(plan.domains).toHaveLength(PROCESS_PAGE_SIZE)
    expect(plan.domains.map((domain) => domain.name)).not.toContain(
      'unique-1000.eth',
    )
    expect(plan.cursorEnd).toBe(100 + PROCESS_PAGE_SIZE - 1)
    expect(plan.hasMore).toBe(true)
  })

  it('detects a split when the processable boundary and lookahead share T', () => {
    const earlier = uniqueDomains(999, 1, 'earlier')
    const tied = domainsAt(50, 10_000, 'tied')
    const plan = planNormalExpiryPage(
      [...earlier, ...tied].slice(0, QUERY_PAGE_SIZE),
      0,
    )

    expect(plan.type).toBe('split-timestamp')
    if (plan.type !== 'split-timestamp') return
    expect(plan.timestamp).toBe(10_000)
    expect(plan.domainsBeforeT).toHaveLength(999)
    expect(
      plan.domainsBeforeT.every((domain) => domain.expiryDate < 10_000),
    ).toBe(true)
  })
})

describe('planExactTimestampPage', () => {
  it('processes every name when the timestamp fits in PROCESS_PAGE_SIZE', () => {
    const domains = domainsAt(50, 10_000, 'tied')
    expect(planExactTimestampPage(domains, 10_000)).toEqual({
      domains,
      overflow: false,
      cursorEnd: 10_000,
    })
  })

  it('processes PROCESS_PAGE_SIZE names and flags overflow on a full lookahead page', () => {
    const domains = domainsAt(QUERY_PAGE_SIZE, 10_000, 'overflow')
    const plan = planExactTimestampPage(domains, 10_000)

    expect(plan.overflow).toBe(true)
    expect(plan.domains).toHaveLength(PROCESS_PAGE_SIZE)
    expect(plan.cursorEnd).toBe(10_000)
    expect(plan.domains.map((domain) => domain.name)).not.toContain(
      'overflow-1000.eth',
    )
  })
})
