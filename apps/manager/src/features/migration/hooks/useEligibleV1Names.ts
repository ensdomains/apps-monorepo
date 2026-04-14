import { useMemo } from 'react'
import type { Address } from 'viem'
import { useMigrationEligibility } from '@/features/migration/hooks/useMigrationEligibility'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import {
  type ClassifiedName,
  classifyNames,
} from '@/features/migration/service/classifyNames'
import { useSmartAccountContext } from '@/lib/smart-account'

export const useEligibleV1Names = () => {
  const { ownerAddress } = useSmartAccountContext()
  const { data: v1NamesRaw, isPending: isV1Pending } = useV1Names()

  const classified = useMemo<ClassifiedName[]>(() => {
    if (!v1NamesRaw || !ownerAddress) return []
    return classifyNames(v1NamesRaw, ownerAddress as Address).classified
  }, [v1NamesRaw, ownerAddress])

  const { data: eligibility, isPending: isEligibilityPending } =
    useMigrationEligibility(classified, ownerAddress)

  const eligible = useMemo<ClassifiedName[]>(
    () => (eligibility ? [...eligibility.eligible] : classified),
    [eligibility, classified],
  )

  return {
    eligible,
    isPending: isV1Pending || (classified.length > 0 && isEligibilityPending),
  }
}
