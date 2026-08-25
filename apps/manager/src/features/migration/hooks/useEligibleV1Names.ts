import { useMemo } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { useMigrationEligibility } from '@/features/migration/hooks/useMigrationEligibility'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { classifyMigrationRecoverySnapshot } from '@/features/migration/service/buildMigrationPlan'
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

export const useEligibleV1Names = (options: UseEligibleV1NamesOptions = {}) => {
  const { enabled = true, fallbackToClassified = true } = options
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  const resolvedOwnerAddress = ownerAddress ?? address
  const { data: v1NamesRaw, isPending: isV1Pending } = useV1Names({ enabled })
  const recoverySnapshot = useMigrationRecoverySnapshot()

  const classified = useMemo<ClassifiedName[]>(() => {
    if (!enabled || !resolvedOwnerAddress) return []
    if (recoverySnapshot) {
      return [
        ...classifyMigrationRecoverySnapshot({
          snapshot: recoverySnapshot,
          migrationOwner: resolvedOwnerAddress as Address,
        }).classified,
      ]
    }
    if (!v1NamesRaw) return []
    return classifyNames(v1NamesRaw, resolvedOwnerAddress as Address).classified
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
    isPending:
      enabled &&
      !recoverySnapshot &&
      (isV1Pending || (classified.length > 0 && isEligibilityPending)),
  }
}
