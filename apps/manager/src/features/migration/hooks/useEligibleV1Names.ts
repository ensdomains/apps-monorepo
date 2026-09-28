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
  classifyNames,
} from '@/features/migration/service/classifyNames'
import { useSmartAccountContext } from '@/lib/smart-account'
import { useMigrationRecoverySnapshot } from './useMigrationRecoverySnapshot'

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
  readonly recoveryState: EligibleV1NamesRecoveryState
}

export const useEligibleV1Names = (options: UseEligibleV1NamesOptions = {}) => {
  const { enabled = true, fallbackToClassified = true } = options
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  const resolvedOwnerAddress = ownerAddress ?? address
  const { data: v1NamesRaw, isPending: isV1Pending } = useV1Names({ enabled })
  const recoverySnapshot = useMigrationRecoverySnapshot()

  const { classified, recoveryState } = useMemo<ClassificationState>(() => {
    if (!enabled || !resolvedOwnerAddress) {
      return { classified: [], recoveryState: { status: 'none' } }
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
          recoveryState: { status: 'recovering' },
        }
      } catch (error) {
        if (!(error instanceof MigrationRecoveryPlanError)) throw error
        return {
          classified: [],
          recoveryState: { status: 'stale', error },
        }
      }
    }
    if (!v1NamesRaw) {
      return { classified: [], recoveryState: { status: 'none' } }
    }
    return {
      classified: classifyNames(
        v1NamesRaw,
        resolvedOwnerAddress as Address,
        envConfig.chain.id,
      ).classified,
      recoveryState: { status: 'none' },
    }
  }, [enabled, recoverySnapshot, v1NamesRaw, resolvedOwnerAddress])

  const { data: eligibility, isPending: isEligibilityPending } =
    useMigrationEligibility(
      recoverySnapshot ? [] : classified,
      enabled ? resolvedOwnerAddress : undefined,
    )

  const eligible = useMemo<readonly ClassifiedName[]>(
    () =>
      recoverySnapshot
        ? classified
        : (eligibility?.eligible ?? (fallbackToClassified ? classified : [])),
    [eligibility, classified, fallbackToClassified, recoverySnapshot],
  )

  return {
    eligible,
    recoveryState,
    isPending:
      enabled &&
      !recoverySnapshot &&
      (isV1Pending || (classified.length > 0 && isEligibilityPending)),
  }
}
