import type { ClassifiedName, GroupedNames } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'

export const MAX_NAMES_PER_BATCH = 10

export type MigrationStepDescriptor =
  | { type: 'ensure-resolver' }
  | {
      type: 'migrate-batch'
      batch: number
      totalBatches: number
      count: number
    }

const getBatchCount = (nameCount: number): number =>
  Math.ceil(nameCount / MAX_NAMES_PER_BATCH)

export const buildStepDescriptors = (
  classified: readonly ClassifiedName[],
  _groups: GroupedNames,
  preflight: MigrationPreflight,
  batchSizes?: readonly number[],
): MigrationStepDescriptor[] => {
  const descriptors: MigrationStepDescriptor[] = []

  const needsOwnedPermRes = classified.some(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  if (needsOwnedPermRes && !preflight.preExistingOwnedPermRes) {
    descriptors.push({ type: 'ensure-resolver' })
  }

  if (batchSizes) {
    const totalBatches = batchSizes.length
    for (const [i, count] of batchSizes.entries()) {
      descriptors.push({
        type: 'migrate-batch',
        batch: i + 1,
        totalBatches,
        count,
      })
    }
    return descriptors
  }

  const totalBatches = getBatchCount(classified.length)
  const lastCount =
    classified.length === 0
      ? 0
      : classified.length - (totalBatches - 1) * MAX_NAMES_PER_BATCH
  for (let i = 0; i < totalBatches; i++) {
    descriptors.push({
      type: 'migrate-batch',
      batch: i + 1,
      totalBatches,
      count: i === totalBatches - 1 ? lastCount : MAX_NAMES_PER_BATCH,
    })
  }

  return descriptors
}
