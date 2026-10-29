import { useMemo } from 'react'
import { useConnection } from 'wagmi'
import { envConfig } from '@/config'
import { getGracePeriodNames } from '@/features/migration/hooks/useEligibleV1Names.helpers'
import { useMigrationEligibility } from '@/features/migration/hooks/useMigrationEligibility'
import { useV1NameClassificationTime } from '@/features/migration/hooks/useV1NameClassificationTime'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { classifyNames } from '@/features/migration/service/classifyNames'
import { useSmartAccountContext } from '@/lib/smart-account'
import { getMigrationEligibleKeys } from './dashboardMigrationEligibility'

/** Namehashes of the ENSv1 names the connected owner can upgrade to ENSv2. */
export const useDashboardMigrationEligibility = () => {
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  const resolvedOwnerAddress = ownerAddress ?? address
  const { data: v1Names, isPending, isError } = useV1Names()
  const nowSeconds = useV1NameClassificationTime(v1Names)

  const { classified, gracePeriodNames } = useMemo(() => {
    if (!v1Names || !resolvedOwnerAddress) {
      return { classified: [], gracePeriodNames: [] }
    }
    const { classified, ineligible } = classifyNames(
      v1Names,
      resolvedOwnerAddress,
      envConfig.chain.id,
    )
    return {
      classified,
      gracePeriodNames: getGracePeriodNames(ineligible, nowSeconds),
    }
  }, [v1Names, resolvedOwnerAddress, nowSeconds])

  const { data: eligibility, isPending: isEligibilityPending } =
    useMigrationEligibility(classified, resolvedOwnerAddress)

  const eligibleKeys = useMemo(
    () =>
      getMigrationEligibleKeys({ classified, gracePeriodNames, eligibility }),
    [classified, gracePeriodNames, eligibility],
  )

  return {
    eligibleKeys,
    isPending: isPending || (classified.length > 0 && isEligibilityPending),
    isError,
  }
}
