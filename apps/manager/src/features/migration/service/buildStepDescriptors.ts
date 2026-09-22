import type { Address } from 'viem'
import type { AtomicMigrationBatch } from './buildAtomicMigrationBatches'
import type {
  MigrationApproval,
  MigrationApprovalId,
  MigrationCleanupApproval,
} from './migrationApprovals'
import { requiresMigrationApprovalCleanup } from './migrationApprovals'

type RegistrationApprovalTarget = {
  readonly name: string
  readonly tokenId: bigint
}

/**
 * An account a step will grant a role to, so the review step can name every
 * address that gains authority over a name before the batch is signed.
 */
export type MigrationRoleGrantDescriptor = {
  readonly name: string
  readonly account: Address
  readonly role: 'set-resolver'
}

export type MigrationStepDescriptor =
  | { readonly type: 'renew-grace'; readonly count: number }
  | { readonly type: 'deploy-hca' }
  | {
      readonly type: 'approval'
      readonly approvalId: MigrationApprovalId
      readonly count?: number
      readonly name?: string
      readonly tokenId?: bigint
      readonly roleGrants?: readonly MigrationRoleGrantDescriptor[]
    }
  | {
      readonly type: 'atomic-batch'
      readonly index: number
      readonly total: number
      readonly count: number
      readonly migrateCount: number
      readonly copyCount: number
      readonly roleGrants: readonly MigrationRoleGrantDescriptor[]
    }
  | {
      readonly type: 'cleanup'
      readonly approvalId: MigrationApprovalId
    }

/**
 * Every third-party account the batch grants `ROLE_SET_RESOLVER` to. Read off
 * the classified names rather than the encoded calls so the review step and the
 * batch can never disagree about who is being granted what.
 */
const roleGrantsForBatch = (
  batch: AtomicMigrationBatch,
): readonly MigrationRoleGrantDescriptor[] =>
  (batch.nameExecutions ?? []).flatMap(({ classified }) =>
    classified.managerAddress
      ? [
          {
            name: classified.domain.name,
            account: classified.managerAddress,
            role: 'set-resolver' as const,
          },
        ]
      : [],
  )

export type BuildStepDescriptorsParams = {
  readonly hcaDeploymentRequired: boolean
  readonly approvals: readonly MigrationApproval[]
  readonly cleanupApprovals?: readonly MigrationCleanupApproval[]
  readonly atomicBatches: readonly AtomicMigrationBatch[]
  readonly registrationApprovalTargets: readonly RegistrationApprovalTarget[]
}

export type MigrationWalletRequestDescriptor =
  | MigrationStepDescriptor
  | { readonly type: 'renewal-approval' }

export const buildStepDescriptors = (
  params: BuildStepDescriptorsParams,
): MigrationStepDescriptor[] => {
  const descriptors: MigrationStepDescriptor[] = []
  const registrationNameByTokenId = new Map(
    params.registrationApprovalTargets.map(({ name, tokenId }) => [
      tokenId,
      name,
    ]),
  )

  if (params.hcaDeploymentRequired) {
    descriptors.push({ type: 'deploy-hca' })
  }

  const allRoleGrants = params.atomicBatches.flatMap(roleGrantsForBatch)

  for (const approval of params.approvals) {
    if (approval.kind === 'erc721-token') {
      descriptors.push({
        type: 'approval',
        approvalId: approval.id,
        name: registrationNameByTokenId.get(approval.tokenId),
        tokenId: approval.tokenId,
      })
      continue
    }

    descriptors.push({
      type: 'approval',
      approvalId: approval.id,
      count:
        approval.id === 'base-registrar:hca'
          ? params.registrationApprovalTargets.length
          : undefined,
      // What this approval will actually be spent on, so its copy can name the
      // restoration instead of promising one. Left undefined when the plan
      // grants nothing — a step must never advertise grants it does not carry,
      // which is what a resumed run with no recorded opt-in produces. The
      // addresses themselves are listed once, on the batch step that performs
      // the grants.
      roleGrants:
        approval.id === 'eth-registry:hca' && allRoleGrants.length > 0
          ? allRoleGrants
          : undefined,
    })
  }

  for (const [index, batch] of params.atomicBatches.entries()) {
    const migrateCount = batch.operations.filter(
      ({ action }) => action === 'migrate',
    ).length
    const copyCount = batch.operations.length - migrateCount
    descriptors.push({
      type: 'atomic-batch',
      index,
      total: params.atomicBatches.length,
      count: batch.names.length,
      migrateCount,
      copyCount,
      roleGrants: roleGrantsForBatch(batch),
    })
  }

  for (const approval of params.cleanupApprovals ?? params.approvals) {
    if (!requiresMigrationApprovalCleanup(approval)) continue
    descriptors.push({ type: 'cleanup', approvalId: approval.id })
  }

  return descriptors
}
