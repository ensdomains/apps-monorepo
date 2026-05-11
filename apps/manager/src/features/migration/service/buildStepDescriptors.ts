import type { ClassifiedName, GroupedNames } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'

export type MigrationStepDescriptor =
  | { type: 'approve-base-registrar' }
  | { type: 'approve-name-wrapper' }
  | { type: 'migrate-helper'; count: number }

export const buildStepDescriptors = (
  classified: readonly ClassifiedName[],
  _groups: GroupedNames,
  preflight: MigrationPreflight,
): MigrationStepDescriptor[] => {
  if (classified.length === 0) return []

  const descriptors: MigrationStepDescriptor[] = []

  if (preflight.needsBaseRegistrarApproval) {
    descriptors.push({ type: 'approve-base-registrar' })
  }
  if (preflight.needsNameWrapperApproval) {
    descriptors.push({ type: 'approve-name-wrapper' })
  }

  descriptors.push({ type: 'migrate-helper', count: classified.length })

  return descriptors
}
