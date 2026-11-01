import type { ClassifiedName } from './classifyNames'

const MIGRATION_ESTIMATE_STAGES = [
  'checking-names',
  'finding-records',
  'reading-records',
  'preparing-upgrade',
  'checking-upgrade',
  'checking-fee',
] as const

export type MigrationEstimateStage = (typeof MIGRATION_ESTIMATE_STAGES)[number]

export type MigrationEstimateProgress = {
  readonly stage: MigrationEstimateStage
  readonly percentage: number
}

/** Carry completed stages forward; only the ready result may display 100%. */
export const getMigrationEstimateProgress = ({
  selectedNames,
  estimatedNames,
  stage,
  previous,
}: {
  readonly selectedNames: readonly string[]
  readonly stage: MigrationEstimateStage
  readonly estimatedNames: readonly string[]
  readonly previous?: MigrationEstimateProgress
}): MigrationEstimateProgress => {
  const selected = [...new Set(selectedNames)]
  const estimated = new Set(estimatedNames)
  const stageIndex = MIGRATION_ESTIMATE_STAGES.indexOf(stage)
  const stageCompletion = selected.length
    ? selected.filter((name) => estimated.has(name)).length / selected.length
    : 0
  const percentage = selected.length
    ? Math.min(
        99,
        Math.floor(
          ((stageIndex + stageCompletion) / MIGRATION_ESTIMATE_STAGES.length) *
            100,
        ),
      )
    : 0
  if (
    previous &&
    MIGRATION_ESTIMATE_STAGES.indexOf(previous.stage) > stageIndex
  )
    return previous
  if (previous?.stage === stage && previous.percentage >= percentage)
    return previous
  return { stage, percentage: Math.max(previous?.percentage ?? 0, percentage) }
}

export type MigrationEstimateUpdate = {
  readonly stage: MigrationEstimateStage
  readonly names: readonly string[]
}

export type MigrationEstimateObserver = (
  update: MigrationEstimateUpdate,
) => void | Promise<void>

export const namesNotRequiringProfileRead = (
  classified: readonly ClassifiedName[],
): readonly string[] =>
  classified
    .filter(
      (name) =>
        name.resolverStrategy !== 'to-owned-permres' ||
        name.v1ResolverAddress === null,
    )
    .map(({ domain }) => domain.name)
