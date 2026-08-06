import type { AtomicMigrationBatch } from './buildAtomicMigrationBatches'
import type {
  MigrationApproval,
  MigrationApprovalId,
} from './migrationApprovals'

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

export type BuildStepDescriptorsParams = {
  readonly hcaDeploymentRequired: boolean
  readonly approvals: readonly MigrationApproval[]
  readonly atomicBatches: readonly AtomicMigrationBatch[]
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

  return descriptors
}
