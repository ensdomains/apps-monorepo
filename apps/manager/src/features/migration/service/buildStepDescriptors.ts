import type { ClassifiedName, GroupedNames } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'

export type MigrationStepDescriptor =
  | { type: 'approve-base-registrar' }
  | { type: 'approve-name-wrapper' }
  | { type: 'ensure-resolver' }
  | { type: 'migrate-batch'; index: number; total: number; count: number }
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

const hasWrappedNames = (groups: GroupedNames): boolean =>
  groups.unlocked.length > 0 ||
  groups.locked2ld.length > 0 ||
  groups.childNames.size > 0

const addApprovalDescriptors = (
  descriptors: MigrationStepDescriptor[],
  params: Pick<
    BuildStepDescriptorsParams,
    | 'groups'
    | 'hasBaseRegistrarApproval'
    | 'hasNameWrapperApproval'
    | 'preflight'
  >,
): void => {
  if (params.preflight.skipApprovalPhase) return
  if (params.groups.unwrapped.length > 0 && !params.hasBaseRegistrarApproval) {
    descriptors.push({ type: 'approve-base-registrar' })
  }
  if (hasWrappedNames(params.groups) && !params.hasNameWrapperApproval) {
    descriptors.push({ type: 'approve-name-wrapper' })
  }
}

const addMigrateDescriptors = (
  descriptors: MigrationStepDescriptor[],
  classified: readonly ClassifiedName[],
  migrateBatchCount: number,
): void => {
  for (let i = 0; i < migrateBatchCount; i++) {
    descriptors.push({
      type: 'migrate-batch',
      index: i,
      total: migrateBatchCount,
      count: batchCount(classified, migrateBatchCount, i),
    })
  }
}

const addRoleGrantDescriptors = (
  descriptors: MigrationStepDescriptor[],
  classified: readonly ClassifiedName[],
): void => {
  for (const n of classified) {
    if (n.managerAddress) {
      descriptors.push({ type: 'grant-role', label: n.label })
    }
  }
}

const addProfileReplayDescriptors = (
  descriptors: MigrationStepDescriptor[],
  hasProfileReplay: boolean,
  profileReplayBatchCount: number,
): void => {
  if (!hasProfileReplay) return
  const total = Math.max(1, profileReplayBatchCount)
  for (let i = 0; i < total; i++) {
    descriptors.push({
      type: 'profile-replay-batch',
      index: i,
      total,
    })
  }
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
  } = params
  const descriptors: MigrationStepDescriptor[] = []

  addApprovalDescriptors(descriptors, {
    groups,
    hasBaseRegistrarApproval,
    hasNameWrapperApproval,
    preflight,
  })

  const needsOwnedPermRes = classified.some(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  if (needsOwnedPermRes && !preflight.preExistingOwnedPermRes) {
    descriptors.push({ type: 'ensure-resolver' })
  }

  addMigrateDescriptors(descriptors, classified, migrateBatchCount)
  addRoleGrantDescriptors(descriptors, classified)
  addProfileReplayDescriptors(
    descriptors,
    hasProfileReplay,
    profileReplayBatchCount,
  )

  return descriptors
}
