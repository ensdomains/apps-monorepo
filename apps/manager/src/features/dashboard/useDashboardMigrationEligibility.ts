import { useMemo } from 'react'
import { useConnection } from 'wagmi'
import { envConfig } from '@/config'
import { getGracePeriodNames } from '@/features/migration/hooks/useEligibleV1Names.helpers'
import {
  useGraceRenewalEligibility,
  useMigrationEligibility,
} from '@/features/migration/hooks/useMigrationEligibility'
import { useV1NameClassificationTime } from '@/features/migration/hooks/useV1NameClassificationTime'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { classifyNames } from '@/features/migration/service/classifyNames'
import { useSmartAccountContext } from '@/lib/smart-account'
import {
  classifyRenewedGraceNames,
  getMigrationEligibleKeys,
} from './dashboardMigrationEligibility'

/** Namehashes of the ENSv1 names the connected owner can upgrade to ENSv2. */
export const useDashboardMigrationEligibility = () => {
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  const resolvedOwnerAddress = ownerAddress ?? address
  const { data: v1Names, isPending, isError } = useV1Names()
  const nowSeconds = useV1NameClassificationTime(v1Names)

  const { classified, renewedGraceNames } = useMemo(() => {
    if (!v1Names || !resolvedOwnerAddress) {
      return { classified: [], renewedGraceNames: [] }
    }
    const { classified, ineligible } = classifyNames(
      v1Names,
      resolvedOwnerAddress,
      envConfig.chain.id,
    )
    return {
      classified,
      renewedGraceNames: classifyRenewedGraceNames({
        gracePeriodNames: getGracePeriodNames(ineligible, nowSeconds),
        ownerAddress: resolvedOwnerAddress,
        chainId: envConfig.chain.id,
        nowSeconds,
      }),
    }
  }, [v1Names, resolvedOwnerAddress, nowSeconds])

  const { data: eligibility, isPending: isEligibilityPending } =
    useMigrationEligibility(classified, resolvedOwnerAddress)
  const { data: graceEligibility, isPending: isGraceEligibilityPending } =
    useGraceRenewalEligibility(renewedGraceNames, resolvedOwnerAddress)

  const eligibleKeys = useMemo(
    () =>
      getMigrationEligibleKeys({ classified, eligibility, graceEligibility }),
    [classified, eligibility, graceEligibility],
  )

  return {
    eligibleKeys,
    isPending:
      isPending ||
      (classified.length > 0 && isEligibilityPending) ||
      (renewedGraceNames.length > 0 && isGraceEligibilityPending),
    isError,
  }
}
