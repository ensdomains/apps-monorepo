import type { AnalyticsFlow } from '@/lib/posthog/flow'
import {
  hasCompletedMigrationOutcome,
  mergeCompletedMigrationOperations,
} from '../service/completedMigrationOperations'
import type { MigrationJournalOperation } from '../service/migrationBatchJournal'
import type { MigrationResult } from '../service/migrationService'

export const captureMigrationCompletion = (
  analytics: AnalyticsFlow,
  result: MigrationResult,
  existing: readonly MigrationJournalOperation[],
) => {
  try {
    const operations = mergeCompletedMigrationOperations(
      existing,
      result.completedOperations,
    )
    if (
      !hasCompletedMigrationOutcome(result, operations) ||
      !analytics.claimCompletion()
    )
      return
    analytics.capture('migration:flow_complete', {
      flow_id: analytics.flow_id,
      item_count: operations.length,
      migrated_count: operations.filter(({ action }) => action === 'migrate')
        .length,
      copied_count: operations.filter(({ action }) => action === 'copy').length,
      ineligible_count: result.ineligible.length,
    })
  } catch {
    // Optional outcome reporting cannot replace the migration service result.
  }
}
