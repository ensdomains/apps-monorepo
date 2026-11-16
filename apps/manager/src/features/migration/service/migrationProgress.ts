import { match } from 'ts-pattern'
import type { MigrationStepDescriptor } from './buildStepDescriptors'
import type { MigrationJournalOperation } from './migrationBatchJournal'

type StepDefinition = {
  readonly descriptor: MigrationStepDescriptor
  readonly operations: readonly MigrationJournalOperation[]
}

type ProgressStep = StepDefinition & {
  readonly id: string
  readonly isComplete: boolean
}

type ProgressEvent =
  | {
      readonly type: 'batch-built'
      readonly operations: readonly MigrationJournalOperation[]
      readonly steps: readonly StepDefinition[]
    }
  | { readonly type: 'step-complete'; readonly id: string }
  | {
      readonly type: 'operations-recovered'
      readonly operations: readonly MigrationJournalOperation[]
    }
  | { readonly type: 'complete' }

export const migrationOperationDescriptor = (
  descriptor: MigrationStepDescriptor,
):
  | Extract<
      MigrationStepDescriptor,
      { readonly type: 'atomic-batch' | 'record-replay' }
    >
  | undefined =>
  match(descriptor)
    .with({ type: 'atomic-batch' }, { type: 'record-replay' }, (step) => step)
    .with({ type: 'bundle' }, ({ steps }) =>
      steps
        .map(migrationOperationDescriptor)
        .find((step) => step !== undefined),
    )
    .otherwise(() => undefined)

const normalizeStep = (step: StepDefinition): StepDefinition => ({
  ...step,
  descriptor:
    step.operations.length > 0
      ? (migrationOperationDescriptor(step.descriptor) ?? step.descriptor)
      : step.descriptor,
})

export const migrationProgressStepId = (step: StepDefinition): string =>
  step.operations.length > 0
    ? JSON.stringify([
        step.descriptor.type,
        step.operations.map(({ name, action }) => [name, action]).sort(),
      ])
    : match(step.descriptor)
        .with({ type: 'approval' }, ({ approvalId, tokenId }) =>
          JSON.stringify(['approval', approvalId, tokenId?.toString()]),
        )
        .with({ type: 'bundle' }, ({ steps }) =>
          JSON.stringify([
            'bundle',
            steps.map((descriptor) =>
              migrationProgressStepId({ descriptor, operations: [] }),
            ),
          ]),
        )
        .otherwise((descriptor) => JSON.stringify(descriptor))

export const createMigrationProgress = (
  steps: readonly StepDefinition[],
): readonly ProgressStep[] =>
  steps.map(normalizeStep).map((step) => ({
    ...step,
    id: migrationProgressStepId(step),
    isComplete: false,
  }))

const hasOperation = (
  operations: readonly MigrationJournalOperation[],
  operation: MigrationJournalOperation,
): boolean =>
  operations.some(
    ({ name, action }) =>
      name === operation.name && action === operation.action,
  )

const resizeStep = (
  step: ProgressStep,
  operations: readonly MigrationJournalOperation[],
): ProgressStep => {
  const descriptor = match(step.descriptor)
    .with({ type: 'atomic-batch' }, (original) => ({
      ...original,
      count: operations.length,
      migrateCount: operations.filter(({ action }) => action === 'migrate')
        .length,
      copyCount: operations.filter(({ action }) => action === 'copy').length,
      roleGrants: original.roleGrants.filter(({ name }) =>
        operations.some((operation) => operation.name === name),
      ),
    }))
    .with({ type: 'record-replay' }, (original) => ({
      ...original,
      count: operations.length,
    }))
    .otherwise((original) => original)
  const resized = { descriptor, operations }
  return {
    ...resized,
    id: migrationProgressStepId(resized),
    isComplete: step.isComplete,
  }
}

export const updateMigrationProgress = (
  steps: readonly ProgressStep[],
  event: ProgressEvent,
): readonly ProgressStep[] =>
  match(event)
    .with({ type: 'step-complete' }, ({ id }) =>
      steps.map((step) =>
        step.id === id ? { ...step, isComplete: true } : step,
      ),
    )
    .with({ type: 'complete' }, () =>
      steps.map((step) => ({ ...step, isComplete: true })),
    )
    .with({ type: 'operations-recovered' }, ({ operations }) =>
      steps.flatMap((step) => {
        if (step.isComplete || step.operations.length === 0) return [step]
        const recovered = step.operations.filter((operation) =>
          hasOperation(operations, operation),
        )
        if (recovered.length === 0) return [step]
        const remaining = step.operations.filter(
          (operation) => !hasOperation(operations, operation),
        )
        return [
          { ...resizeStep(step, recovered), isComplete: true },
          ...(remaining.length > 0 ? [resizeStep(step, remaining)] : []),
        ]
      }),
    )
    .with({ type: 'batch-built' }, ({ operations, steps: liveSteps }) => {
      const retained = steps.flatMap((step) => {
        if (step.isComplete || step.operations.length === 0) return [step]
        const remaining = step.operations.filter(
          (operation) => !hasOperation(operations, operation),
        )
        return remaining.length > 0 ? [resizeStep(step, remaining)] : []
      })
      return [
        ...retained.filter(
          (step) => step.isComplete || step.operations.length === 0,
        ),
        ...createMigrationProgress(liveSteps).filter(
          (step) => !retained.some((existing) => existing.id === step.id),
        ),
        ...retained.filter(
          (step) => !step.isComplete && step.operations.length > 0,
        ),
      ]
    })
    .exhaustive()

export const getMigrationProgress = (steps: readonly ProgressStep[]) => {
  const ordered = [
    ...steps.filter((step) => step.isComplete),
    ...steps.filter((step) => !step.isComplete),
  ]
  const batches = ordered.filter(
    ({ descriptor }) => descriptor.type === 'atomic-batch',
  )
  return {
    currentStep: steps.filter((step) => step.isComplete).length,
    totalSteps: Math.max(steps.length, 1),
    stepDescriptors: ordered.map(({ descriptor, operations }) =>
      match(descriptor)
        .with({ type: 'atomic-batch' }, (original) => ({
          ...original,
          index: batches.findIndex(
            (batch) =>
              migrationProgressStepId(batch) ===
              migrationProgressStepId({ descriptor, operations }),
          ),
          total: batches.length,
        }))
        .with({ type: 'record-replay' }, (original) => ({
          ...original,
          index: batches.findIndex((batch) =>
            operations.some((operation) =>
              hasOperation(batch.operations, operation),
            ),
          ),
        }))
        .otherwise((original) => original),
    ),
  }
}
