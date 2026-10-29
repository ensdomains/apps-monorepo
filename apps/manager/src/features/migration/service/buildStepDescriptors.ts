import type { Address } from 'viem'
import {
  type AtomicMigrationBatch,
  walletReplayNames,
} from './buildAtomicMigrationBatches'
import type {
  MigrationApproval,
  MigrationApprovalId,
} from './migrationApprovals'

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
      /**
       * The owner wallet replaying records the HCA can no longer write. Sits
       * before its `atomic-batch` because it has to land first.
       */
      readonly type: 'record-replay'
      readonly index: number
      readonly count: number
    }
  | {
      readonly type: 'cleanup'
      readonly approvalId: MigrationApprovalId
    }
  | {
      /** Several steps the wallet confirms at once, as one EIP-5792 bundle. */
      readonly type: 'bundle'
      readonly steps: readonly MigrationStepDescriptor[]
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
  readonly atomicBatches: readonly AtomicMigrationBatch[]
  readonly registrationApprovalTargets: readonly RegistrationApprovalTarget[]
  /**
   * The wallet bundles calls atomically: setup (deployment + approvals) is one
   * confirmation. Each migration batch is a separate confirmation.
   */
  readonly canBatchAtomically?: boolean
}

export type MigrationWalletRequestDescriptor =
  | MigrationStepDescriptor
  | { readonly type: 'renewal-approval' }

const approvalDescriptor = (params: {
  readonly approval: MigrationApproval
  readonly registrationNameByTokenId: ReadonlyMap<bigint, string>
  readonly registrationCount: number
  readonly allRoleGrants: readonly MigrationRoleGrantDescriptor[]
}): MigrationStepDescriptor => {
  const { approval } = params
  if (approval.kind === 'erc721-token') {
    return {
      type: 'approval',
      approvalId: approval.id,
      name: params.registrationNameByTokenId.get(approval.tokenId),
      tokenId: approval.tokenId,
    }
  }

  return {
    type: 'approval',
    approvalId: approval.id,
    count:
      approval.id === 'base-registrar:hca'
        ? params.registrationCount
        : undefined,
    // What this approval will actually be spent on, so its copy can name the
    // restoration instead of promising one. Left undefined when the plan grants
    // nothing — a step must never advertise grants it does not carry, which is
    // what a resumed run with no recorded opt-in produces. The addresses
    // themselves are listed once, on the batch step that performs the grants.
    roleGrants:
      approval.id === 'eth-registry:hca' && params.allRoleGrants.length > 0
        ? params.allRoleGrants
        : undefined,
  }
}

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
    descriptors.push(
      approvalDescriptor({
        approval,
        registrationNameByTokenId,
        registrationCount: params.registrationApprovalTargets.length,
        allRoleGrants,
      }),
    )
  }

  for (const [index, batch] of params.atomicBatches.entries()) {
    const migrateCount = batch.operations.filter(
      ({ action }) => action === 'migrate',
    ).length
    const copyCount = batch.operations.length - migrateCount
    // Ahead of the batch: the replay has to land before the names migrate.
    // Count only the names whose records the call carries, not every name in
    // the batch.
    if (batch.walletCall) {
      descriptors.push({
        type: 'record-replay',
        index,
        count: walletReplayNames(batch).length,
      })
    }
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

  return params.canBatchAtomically
    ? bundleDescriptors(descriptors)
    : descriptors
}

const bundleOf = (
  steps: readonly MigrationStepDescriptor[],
): MigrationStepDescriptor[] => {
  if (steps.length === 0) return []
  if (steps.length === 1) return [...steps]
  return [{ type: 'bundle', steps }]
}

/** Regroups sequential descriptors into the confirmations an atomic wallet sees. */
const bundleDescriptors = (
  descriptors: readonly MigrationStepDescriptor[],
): MigrationStepDescriptor[] => {
  const setup = descriptors.filter(
    ({ type }) => type === 'deploy-hca' || type === 'approval',
  )
  const batches = descriptors.filter(({ type }) => type === 'atomic-batch')
  return [...bundleOf(setup), ...batches]
}
