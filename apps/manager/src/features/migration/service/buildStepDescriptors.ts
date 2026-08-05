import type { AtomicMigrationBatch } from './buildAtomicMigrationBatches'
import type {
  MigrationApproval,
  MigrationApprovalId,
} from './migrationApprovals'
import { migrationApprovalNeedsExplicitCleanup } from './migrationApprovals'

export type MigrationStepDescriptor =
  | { readonly type: 'deploy-hca' }
  | {
      readonly type: 'approval'
      readonly approvalId: MigrationApprovalId
    }
  | {
      readonly type: 'atomic-batch'
      readonly index: number
      readonly total: number
      readonly count: number
    }
  | { readonly type: 'cleanup'; readonly count: number }

export type BuildStepDescriptorsParams = {
  readonly hcaDeploymentRequired: boolean
  readonly approvals: readonly MigrationApproval[]
  readonly atomicBatches: readonly AtomicMigrationBatch[]
  readonly cleanupApprovalCount?: number
}

export const buildStepDescriptors = (
  params: BuildStepDescriptorsParams,
): MigrationStepDescriptor[] => {
  const descriptors: MigrationStepDescriptor[] = []

  if (params.hcaDeploymentRequired) {
    descriptors.push({ type: 'deploy-hca' })
  }

  for (const approval of params.approvals) {
    descriptors.push({
      type: 'approval',
      approvalId: approval.id,
    })
  }

  for (const [index, batch] of params.atomicBatches.entries()) {
    descriptors.push({
      type: 'atomic-batch',
      index,
      total: params.atomicBatches.length,
      count: batch.names.length,
    })
  }

  const cleanupApprovalCount =
    params.cleanupApprovalCount ??
    params.approvals.filter(migrationApprovalNeedsExplicitCleanup).length
  if (cleanupApprovalCount > 0) {
    descriptors.push({ type: 'cleanup', count: cleanupApprovalCount })
  }

  return descriptors
}
