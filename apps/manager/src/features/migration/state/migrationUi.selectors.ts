import { match, P } from 'ts-pattern'
import { createMigrationUiSelector } from './migrationUi.context'

export const useMigrationStep = createMigrationUiSelector((state) =>
  match(state.value)
    .with({ migrate: P.any }, () => 'migrate' as const)
    .with({ renewGrace: P.any }, () => 'renewGrace' as const)
    .with(P.string, (step) => step)
    .exhaustive(),
)

export const useMigrateSubstep = createMigrationUiSelector((state) =>
  match(state.value)
    .with({ migrate: P.string }, ({ migrate }) => migrate)
    .otherwise(() => undefined),
)

export const useRenewGraceSubstep = createMigrationUiSelector((state) =>
  match(state.value)
    .with({ renewGrace: P.string }, ({ renewGrace }) => renewGrace)
    .otherwise(() => undefined),
)

export const useGraceRenewalProgress = createMigrationUiSelector(
  (state) => state.context.renewalProgress,
)

export const useMigrationProgress = createMigrationUiSelector(
  (state) => state.context.progress,
)

export const useMigrationStepDescriptors = createMigrationUiSelector(
  (state) => state.context.stepDescriptors,
)

export const useMigrationMigratedNames = createMigrationUiSelector(
  (state) => state.context.migratedNames,
)

export const useMigrationLastError = createMigrationUiSelector(
  (state) => state.context.lastError,
)

export const useMigrationSelectedNames = createMigrationUiSelector(
  (state) => state.context.selectedNames,
)
