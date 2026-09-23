import { ResultFn } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import {
  type ExpiringDomain,
  fetchExpiringNamesPage,
  PROCESS_PAGE_SIZE,
} from './indexer.js'
import type { ExpiryStageConfig } from './stages.js'

export type ExpiryTimestampOverflow = {
  expiryTimestamp: number
  processedCount: number
}

export type ProcessableExpiryPage = {
  domains: ExpiringDomain[]
  cursorEnd: number
  hasMore: boolean
  overflow?: ExpiryTimestampOverflow
}

export type NormalExpiryPagePlan =
  | {
      type: 'complete'
      domains: ExpiringDomain[]
      cursorEnd: number
      hasMore: false
    }
  | {
      type: 'safe-boundary'
      domains: ExpiringDomain[]
      cursorEnd: number
      hasMore: true
    }
  | {
      type: 'split-timestamp'
      domainsBeforeTimestamp: ExpiringDomain[]
      timestamp: number
    }

const lastExpiryDate = (
  domains: readonly ExpiringDomain[],
  fallback: number,
): number => domains.at(-1)?.expiryDate ?? fallback

export function planNormalExpiryPage(
  domains: readonly ExpiringDomain[],
  queryCursor: number,
): NormalExpiryPagePlan {
  if (domains.length <= PROCESS_PAGE_SIZE) {
    return {
      type: 'complete',
      domains: [...domains],
      cursorEnd: lastExpiryDate(domains, queryCursor),
      hasMore: false,
    }
  }

  const processable = domains.slice(0, PROCESS_PAGE_SIZE)
  const boundary = processable.at(-1)
  const lookahead = domains[PROCESS_PAGE_SIZE]
  if (!boundary || !lookahead) {
    return {
      type: 'complete',
      domains: processable,
      cursorEnd: lastExpiryDate(processable, queryCursor),
      hasMore: false,
    }
  }

  if (boundary.expiryDate !== lookahead.expiryDate) {
    return {
      type: 'safe-boundary',
      domains: processable,
      cursorEnd: boundary.expiryDate,
      hasMore: true,
    }
  }

  return {
    type: 'split-timestamp',
    domainsBeforeTimestamp: processable.filter(
      (domain) => domain.expiryDate < boundary.expiryDate,
    ),
    timestamp: boundary.expiryDate,
  }
}

export function planExactTimestampPage(
  domains: readonly ExpiringDomain[],
  timestamp: number,
) {
  return {
    domains: [...domains.slice(0, PROCESS_PAGE_SIZE)],
    overflow: domains.length > PROCESS_PAGE_SIZE,
    cursorEnd: timestamp,
  }
}

export const fetchProcessableExpiringNames = ResultFn(async function* (ctx: {
  env: CloudflareBindings
  stage: ExpiryStageConfig
  cursor: number
  upperBound: number
}) {
  const page = yield* fetchExpiringNamesPage(ctx)
  const plan = planNormalExpiryPage(page.domains, ctx.cursor)

  if (plan.type !== 'split-timestamp') {
    return ok({
      domains: plan.domains,
      cursorEnd: plan.cursorEnd,
      hasMore: plan.hasMore,
      overflow: undefined,
    } satisfies ProcessableExpiryPage)
  }

  const exactPage = yield* fetchExpiringNamesPage({
    ...ctx,
    cursor: plan.timestamp - 1,
    upperBound: plan.timestamp,
  })
  const exactPlan = planExactTimestampPage(exactPage.domains, plan.timestamp)

  return ok({
    domains: [...plan.domainsBeforeTimestamp, ...exactPlan.domains],
    cursorEnd: exactPlan.cursorEnd,
    hasMore: true,
    overflow: exactPlan.overflow
      ? {
          expiryTimestamp: plan.timestamp,
          processedCount: exactPlan.domains.length,
        }
      : undefined,
  } satisfies ProcessableExpiryPage)
})
