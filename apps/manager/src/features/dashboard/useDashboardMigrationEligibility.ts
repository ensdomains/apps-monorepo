import { useMemo } from 'react'
import { useConnection } from 'wagmi'
import { envConfig } from '@/config'
import { useMigrationEligibility } from '@/features/migration/hooks/useMigrationEligibility'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { classifyNames } from '@/features/migration/service/classifyNames'
import { useSmartAccountContext } from '@/lib/smart-account'

const NO_NAMES: ReadonlySet<string> = new Set()

/** Namehashes of the ENSv1 names the connected owner can upgrade to ENSv2. */
export const useDashboardMigrationEligibility = (migrationEnabled: boolean) => {
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  const resolvedOwnerAddress = ownerAddress ?? address
  const { data: v1Names, isPending, isError } = useV1Names()

  const classified = useMemo(() => {
    if (!migrationEnabled || !v1Names || !resolvedOwnerAddress) return []
    return classifyNames(v1Names, resolvedOwnerAddress, envConfig.chain.id)
      .classified
  }, [migrationEnabled, v1Names, resolvedOwnerAddress])

  const { data: eligibility, isPending: isEligibilityPending } =
    useMigrationEligibility(
      classified,
      migrationEnabled ? resolvedOwnerAddress : undefined,
    )

  const eligibleKeys = useMemo(
    () =>
      migrationEnabled
        ? new Set(
            (eligibility?.eligible ?? classified).map((name) =>
              name.domain.id.toLowerCase(),
            ),
          )
        : NO_NAMES,
    [classified, eligibility?.eligible, migrationEnabled],
  )

  return {
    eligibleKeys,
    isPending:
      migrationEnabled &&
      (isPending || (classified.length > 0 && isEligibilityPending)),
    isError: migrationEnabled && isError,
  }
}
