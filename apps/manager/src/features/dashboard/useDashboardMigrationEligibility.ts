import { useMemo } from 'react'
import { useConnection } from 'wagmi'
import { envConfig } from '@/config'
import { useMigrationEligibility } from '@/features/migration/hooks/useMigrationEligibility'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { classifyNames } from '@/features/migration/service/classifyNames'
import { useSmartAccountContext } from '@/lib/smart-account'

/** Namehashes of the ENSv1 names the connected owner can upgrade to ENSv2. */
export const useDashboardMigrationEligibility = () => {
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  const resolvedOwnerAddress = ownerAddress ?? address
  const { data: v1Names, isPending, isError } = useV1Names()

  const classified = useMemo(() => {
    if (!v1Names || !resolvedOwnerAddress) return []
    return classifyNames(v1Names, resolvedOwnerAddress, envConfig.chain.id)
      .classified
  }, [v1Names, resolvedOwnerAddress])

  const { data: eligibility, isPending: isEligibilityPending } =
    useMigrationEligibility(classified, resolvedOwnerAddress)

  const eligibleKeys = useMemo(
    () =>
      new Set(
        [
          ...(eligibility?.eligible ?? classified),
          ...(eligibility?.needsWrapperSync ?? []),
        ].map((name) => name.domain.id.toLowerCase()),
      ),
    [classified, eligibility?.eligible, eligibility?.needsWrapperSync],
  )

  return {
    eligibleKeys,
    isPending: isPending || (classified.length > 0 && isEligibilityPending),
    isError,
  }
}
