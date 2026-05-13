import type { ClassifiedName, GroupedNames } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'

export type MigrationStepDescriptor =
  | { type: 'approve-base-registrar' }
  | { type: 'approve-name-wrapper' }
  | { type: 'ensure-resolver' }
  | { type: 'migrate-batch'; index: number; total: number; count: number }
  | { type: 'grant-role-batch'; index: number; total: number; count: number }
  | { type: 'grant-role'; label: string }
  | { type: 'profile-replay-batch'; index: number; total: number }

type BuildStepDescriptorsParams = {
  readonly classified: readonly ClassifiedName[]
  readonly groups: GroupedNames
  readonly preflight: MigrationPreflight
  readonly hasBaseRegistrarApproval: boolean
  readonly hasNameWrapperApproval: boolean
  readonly hasProfileReplay: boolean
  readonly migrateBatchCount: number
  readonly profileReplayBatchCount: number
  readonly roleGrantBatchCount: number
}

const batchCount = (
  classified: readonly ClassifiedName[],
  total: number,
  i: number,
): number => {
  if (total <= 0) return 0
  const base = Math.floor(classified.length / total)
  const remainder = classified.length % total
  return base + (i < remainder ? 1 : 0)
}

export const buildStepDescriptors = (
  params: BuildStepDescriptorsParams,
): MigrationStepDescriptor[] => {
  const {
    classified,
    groups,
    preflight,
    hasBaseRegistrarApproval,
    hasNameWrapperApproval,
    hasProfileReplay,
    migrateBatchCount,
    profileReplayBatchCount,
    roleGrantBatchCount,
  } = params
  const descriptors: MigrationStepDescriptor[] = []

  if (!preflight.skipApprovalPhase) {
    if (groups.unwrapped.length > 0 && !hasBaseRegistrarApproval) {
      descriptors.push({ type: 'approve-base-registrar' })
    }
    const hasWrapped =
      groups.unlocked.length > 0 ||
      groups.locked2ld.length > 0 ||
      groups.childNames.size > 0
    if (hasWrapped && !hasNameWrapperApproval) {
      descriptors.push({ type: 'approve-name-wrapper' })
    }
  }

  const needsOwnedPermRes = classified.some(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  if (needsOwnedPermRes && !preflight.preExistingOwnedPermRes) {
    descriptors.push({ type: 'ensure-resolver' })
  }

  for (let i = 0; i < migrateBatchCount; i++) {
    descriptors.push({
      type: 'migrate-batch',
      index: i,
      total: migrateBatchCount,
      count: batchCount(classified, migrateBatchCount, i),
    })
  }

  if (roleGrantBatchCount > 0) {
    const managed = classified.filter((n) => n.managerAddress)
    for (let i = 0; i < roleGrantBatchCount; i++) {
      descriptors.push({
        type: 'grant-role-batch',
        index: i,
        total: roleGrantBatchCount,
        count: batchCount(managed, roleGrantBatchCount, i),
      })
    }
  } else {
    for (const n of classified) {
      if (n.managerAddress) {
        descriptors.push({ type: 'grant-role', label: n.label })
      }
    }
  }

  if (hasProfileReplay) {
    for (let i = 0; i < Math.max(1, profileReplayBatchCount); i++) {
      descriptors.push({
        type: 'profile-replay-batch',
        index: i,
        total: Math.max(1, profileReplayBatchCount),
      })
    }
  }

  return descriptors
}
