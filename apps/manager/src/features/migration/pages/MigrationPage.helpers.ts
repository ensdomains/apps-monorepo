import type { QueryKey } from '@tanstack/react-query'

const REFRESH_SCOPES = new Set(['dashboard', 'migration', 'profile'])

type MigrationPageStep =
  | 'select'
  | 'renewGrace'
  | 'migrate'
  | 'success'
  | 'failure'

type GasEstimateStatus = 'idle' | 'loading' | 'ready' | 'error'
type GasFundingStatus = 'idle' | 'funding' | 'settled'

type AutoMigrationStartAfterRenewalParams = {
  readonly step: MigrationPageStep
  readonly selectedNames: readonly string[]
  readonly renewedGraceNames: readonly string[]
  readonly selectedRenewableGraceCount: number
  readonly gasEstimateStatus: GasEstimateStatus
  readonly gasFundingStatus: GasFundingStatus
  readonly canSubmitMigration: boolean
}

const buildNamesKey = (names: readonly string[]): string =>
  names
    .map((name) => name.toLowerCase())
    .sort()
    .join(',')

export const isMigrationQueryKey = (key: QueryKey): boolean => {
  const first = key[0]
  if (first === 'migration-preflight') return true
  if (
    typeof first === 'object' &&
    first !== null &&
    '$scope' in first &&
    (first as { $scope: unknown }).$scope === 'migration'
  ) {
    return true
  }
  return false
}

export const isPostMigrationRefreshQueryKey = (key: QueryKey): boolean => {
  if (isMigrationQueryKey(key)) return true
  const first = key[0]
  return (
    typeof first === 'object' &&
    first !== null &&
    '$scope' in first &&
    typeof (first as { $scope: unknown }).$scope === 'string' &&
    REFRESH_SCOPES.has((first as { $scope: string }).$scope)
  )
}

export const getAutoMigrationStartKeyAfterRenewal = ({
  step,
  selectedNames,
  renewedGraceNames,
  selectedRenewableGraceCount,
  gasEstimateStatus,
  gasFundingStatus,
  canSubmitMigration,
}: AutoMigrationStartAfterRenewalParams): string | undefined => {
  if (step !== 'select') return undefined
  if (selectedNames.length === 0) return undefined
  if (renewedGraceNames.length === 0) return undefined
  if (selectedRenewableGraceCount > 0) return undefined
  if (gasEstimateStatus !== 'ready') return undefined
  if (gasFundingStatus === 'funding') return undefined
  if (!canSubmitMigration) return undefined

  return `selected=${buildNamesKey(selectedNames)}|renewed=${buildNamesKey(
    renewedGraceNames,
  )}`
}
