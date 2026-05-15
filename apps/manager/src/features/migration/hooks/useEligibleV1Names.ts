import { useMemo } from 'react'
import type { Address } from 'viem'
import { useMigrationEligibility } from '@/features/migration/hooks/useMigrationEligibility'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import {
  type ClassifiedName,
  classifyNames,
} from '@/features/migration/service/classifyNames'
import { useSmartAccountContext } from '@/lib/smart-account'

type UseEligibleV1NamesOptions = {
  readonly enabled?: boolean
}

export const useEligibleV1Names = (options: UseEligibleV1NamesOptions = {}) => {
  const { enabled = true } = options
  const { ownerAddress } = useSmartAccountContext()
  const { data: v1NamesRaw, isPending: isV1Pending } = useV1Names({ enabled })

  const classified = useMemo<ClassifiedName[]>(() => {
    if (!enabled || !v1NamesRaw || !ownerAddress) return []
    return classifyNames(v1NamesRaw, ownerAddress as Address).classified
  }, [enabled, v1NamesRaw, ownerAddress])

  const { data: eligibility, isPending: isEligibilityPending } =
    useMigrationEligibility(classified, enabled ? ownerAddress : undefined)

  const eligible = useMemo<readonly ClassifiedName[]>(
    () => eligibility?.eligible ?? classified,
    [eligibility, classified],
  )

  return {
    eligible,
    isPending:
      enabled &&
      (isV1Pending || (classified.length > 0 && isEligibilityPending)),
  }
}
