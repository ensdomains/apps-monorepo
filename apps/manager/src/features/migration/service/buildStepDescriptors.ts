import { chunkArray } from './chunkArray'
import type { ClassifiedName, GroupedNames } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'

export const MAX_NAMES_PER_BATCH = 50

export type MigrationStepDescriptor =
  | { type: 'approve-sca'; count: number }
  | { type: 'ensure-resolver' }
  | {
      type: 'migrate-batch'
      batch: number
      totalBatches: number
      count: number
    }

export const needsSCAApproval = (groups: GroupedNames): boolean =>
  groups.unwrapped.length > 0 ||
  groups.unlocked.length > 0 ||
  groups.locked2ld.length > 0 ||
  groups.childNames.size > 0

export const getBatchCount = (nameCount: number): number =>
  Math.ceil(nameCount / MAX_NAMES_PER_BATCH)

export const buildStepDescriptors = (
  classified: readonly ClassifiedName[],
  groups: GroupedNames,
  preflight: MigrationPreflight,
): MigrationStepDescriptor[] => {
  const descriptors: MigrationStepDescriptor[] = []

  if (needsSCAApproval(groups) && !preflight.skipApprovalPhase) {
    descriptors.push({ type: 'approve-sca', count: classified.length })
  }

  const needsOwnedPermRes = classified.some(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  if (needsOwnedPermRes && !preflight.preExistingOwnedPermRes) {
    descriptors.push({ type: 'ensure-resolver' })
  }

  const totalBatches = getBatchCount(classified.length)
  const chunks = chunkArray(classified, MAX_NAMES_PER_BATCH)
  for (let i = 0; i < chunks.length; i++) {
    descriptors.push({
      type: 'migrate-batch',
      batch: i + 1,
      totalBatches,
      count: chunks[i]!.length,
    })
  }

  return descriptors
}
