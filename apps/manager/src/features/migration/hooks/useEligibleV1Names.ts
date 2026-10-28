import { useMemo } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { envConfig } from '@/config'
import { useMigrationEligibility } from '@/features/migration/hooks/useMigrationEligibility'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import {
  classifyMigrationRecoverySnapshot,
  MigrationRecoveryPlanError,
} from '@/features/migration/service/buildMigrationPlan'
import {
  type ClassifiedName,
  type CopyClassifiedName,
  classifyNames,
  type IneligibleName,
} from '@/features/migration/service/classifyNames'
import { useSmartAccountContext } from '@/lib/smart-account'
import {
  getGracePeriodNames,
  getUnavailableNames,
} from './useEligibleV1Names.helpers'
import type { BlockedSubnameMigration } from './useMigrationEligibility'
import { useMigrationRecoverySnapshot } from './useMigrationRecoverySnapshot'
import { useV1NameClassificationTime } from './useV1NameClassificationTime'

const EMPTY_WRAPPER_SYNC_NAMES: readonly ClassifiedName[] = []

type UseEligibleV1NamesOptions = {
  readonly enabled?: boolean
  readonly fallbackToClassified?: boolean
}

type EligibleV1NamesRecoveryState =
  | { readonly status: 'none' }
  | { readonly status: 'recovering' }
  | {
      readonly status: 'stale'
      readonly error: MigrationRecoveryPlanError
    }

type ClassificationState = {
  readonly classified: readonly ClassifiedName[]
  readonly gracePeriodNames: readonly IneligibleName[]
  readonly unavailableNames: readonly IneligibleName[]
  readonly recoveryState: EligibleV1NamesRecoveryState
}

export const useEligibleV1Names = (options: UseEligibleV1NamesOptions = {}) => {
  const { enabled = true, fallbackToClassified = true } = options
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  const resolvedOwnerAddress = ownerAddress ?? address
  const recoverySnapshot = useMigrationRecoverySnapshot()
  const {
    data: v1NamesRaw,
    isPending: isV1Pending,
    isError: isV1Error,
    refetch: refetchV1Names,
  } = useV1Names({ enabled: enabled && !recoverySnapshot })
  const nowSeconds = useV1NameClassificationTime(
    recoverySnapshot?.registryDomains ?? v1NamesRaw,
    enabled,
  )

  const { classified, gracePeriodNames, unavailableNames, recoveryState } =
    useMemo<ClassificationState>(() => {
      if (!enabled || !resolvedOwnerAddress) {
        return {
          classified: [],
          gracePeriodNames: [],
          unavailableNames: [],
          recoveryState: { status: 'none' },
        }
      }
      if (recoverySnapshot) {
        try {
          return {
            classified: [
              ...classifyMigrationRecoverySnapshot({
                snapshot: recoverySnapshot,
                migrationOwner: resolvedOwnerAddress as Address,
              }).classified,
            ],
            gracePeriodNames: [],
            unavailableNames: [],
            recoveryState: { status: 'recovering' },
          }
        } catch (error) {
          if (!(error instanceof MigrationRecoveryPlanError)) throw error
          return {
            classified: [],
            gracePeriodNames: [],
            unavailableNames: [],
            recoveryState: { status: 'stale', error },
          }
        }
      }
      if (!v1NamesRaw) {
        return {
          classified: [],
          gracePeriodNames: [],
          unavailableNames: [],
          recoveryState: { status: 'none' },
        }
      }
      const { classified, ineligible } = classifyNames(
        v1NamesRaw,
        resolvedOwnerAddress as Address,
        envConfig.chain.id,
      )
      return {
        classified,
        gracePeriodNames: getGracePeriodNames(ineligible, nowSeconds),
        unavailableNames: getUnavailableNames(ineligible),
        recoveryState: { status: 'none' },
      }
    }, [
      enabled,
      recoverySnapshot,
      v1NamesRaw,
      resolvedOwnerAddress,
      nowSeconds,
    ])

  const {
    data: eligibility,
    isPending: isEligibilityPending,
    isError: isEligibilityError,
    refetch: refetchEligibility,
  } = useMigrationEligibility(
    recoverySnapshot ? [] : classified,
    enabled ? resolvedOwnerAddress : undefined,
  )

  const eligible = useMemo<readonly ClassifiedName[]>(() => {
    if (recoverySnapshot) return classified
    if (isEligibilityError || isV1Error) return []
    if (!eligibility) return fallbackToClassified ? classified : []

    // Cached RPC eligibility must not keep a newly expired name selectable.
    const eligibleIds = new Set(
      eligibility.eligible.map(({ domain }) => domain.id),
    )
    return classified.filter(({ domain }) => eligibleIds.has(domain.id))
  }, [
    eligibility,
    classified,
    fallbackToClassified,
    recoverySnapshot,
    isEligibilityError,
    isV1Error,
  ])

  const blockedSubnames: readonly BlockedSubnameMigration[] = recoverySnapshot
    ? []
    : (eligibility?.blockedSubnames ?? [])

  const verifiedSubnames = useMemo<readonly CopyClassifiedName[]>(() => {
    if (recoverySnapshot) return []
    const eligibleNames = new Set(eligible.map(({ domain }) => domain.name))
    return (eligibility?.verifiedSubnames ?? []).filter(
      ({ recreationRoot }) =>
        recreationRoot && eligibleNames.has(recreationRoot),
    )
  }, [eligibility, eligible, recoverySnapshot])

  return {
    eligible,
    gracePeriodNames,
    unavailableNames,
    blockedSubnames,
    verifiedSubnames,
    isEligibilityError:
      !recoverySnapshot && (!!isEligibilityError || !!isV1Error),
    retryEligibility: () => {
      if (recoverySnapshot) return
      void refetchV1Names()
      void refetchEligibility()
    },
    wrapperSyncNames: recoverySnapshot
      ? EMPTY_WRAPPER_SYNC_NAMES
      : (eligibility?.needsWrapperSync ?? EMPTY_WRAPPER_SYNC_NAMES),
    recoveryState,
    isPending:
      enabled &&
      !recoverySnapshot &&
      (isV1Pending || (classified.length > 0 && isEligibilityPending)),
  }
}
