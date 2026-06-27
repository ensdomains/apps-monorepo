import { useMemo } from 'react'
import type { Address } from 'viem'
import { useMigrationEligibility } from '@/features/migration/hooks/useMigrationEligibility'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import {
  type ClassifiedName,
  classifyNames,
  type RenewableGraceName,
} from '@/features/migration/service/classifyNames'
import { useSmartAccountContext } from '@/lib/smart-account'

const EMPTY_RENEWED_GRACE_NAMES: readonly string[] = []

type UseEligibleV1NamesOptions = {
  readonly enabled?: boolean
  readonly fallbackToClassified?: boolean
  readonly renewedGraceNames?: readonly string[]
}

export const useEligibleV1Names = (options: UseEligibleV1NamesOptions = {}) => {
  const {
    enabled = true,
    fallbackToClassified = true,
    renewedGraceNames = EMPTY_RENEWED_GRACE_NAMES,
  } = options
  const { ownerAddress } = useSmartAccountContext()
  const { data: v1NamesRaw, isPending: isV1Pending } = useV1Names({ enabled })

  const classifiedResult = useMemo(() => {
    if (!enabled || !v1NamesRaw || !ownerAddress)
      return {
        classified: [] as ClassifiedName[],
        renewableGrace: [] as RenewableGraceName[],
      }
    const result = classifyNames(v1NamesRaw, ownerAddress as Address, {
      renewedGraceNames: new Set(renewedGraceNames),
    })
    return {
      classified: result.classified,
      renewableGrace: result.renewableGrace,
    }
  }, [enabled, v1NamesRaw, ownerAddress, renewedGraceNames])

  const { data: eligibility, isPending: isEligibilityPending } =
    useMigrationEligibility(
      classifiedResult.classified,
      enabled ? ownerAddress : undefined,
    )

  const eligible = useMemo<readonly ClassifiedName[]>(
    () =>
      eligibility?.eligible ??
      (fallbackToClassified ? classifiedResult.classified : []),
    [eligibility, classifiedResult.classified, fallbackToClassified],
  )

  return {
    eligible,
    renewableGrace: classifiedResult.renewableGrace,
    isPending:
      enabled &&
      (isV1Pending ||
        (classifiedResult.classified.length > 0 && isEligibilityPending)),
  }
}
