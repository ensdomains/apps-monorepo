import type { ClassifiedName, GroupedNames } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'

export type MigrationStepDescriptor =
  | { type: 'approve-base-registrar' }
  | { type: 'approve-name-wrapper' }
  | { type: 'ensure-resolver' }
  | { type: 'migrate-all'; count: number }
  | { type: 'grant-role'; label: string }
  | { type: 'profile-replay'; label: string }

export const needsApproval = (groups: GroupedNames): boolean =>
  groups.unwrapped.length > 0 ||
  groups.unlocked.length > 0 ||
  groups.locked2ld.length > 0 ||
  groups.childNames.size > 0

type BuildStepDescriptorsParams = {
  readonly classified: readonly ClassifiedName[]
  readonly groups: GroupedNames
  readonly preflight: MigrationPreflight
  readonly hasBaseRegistrarApproval: boolean
  readonly hasNameWrapperApproval: boolean
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

  if (classified.length > 0) {
    descriptors.push({ type: 'migrate-all', count: classified.length })
  }

  for (const name of classified) {
    if (name.managerAddress) {
      descriptors.push({ type: 'grant-role', label: name.label })
    }
  }
  for (const name of classified) {
    if (name.resolverStrategy === 'to-owned-permres') {
      descriptors.push({ type: 'profile-replay', label: name.label })
    }
  }

  return descriptors
}
