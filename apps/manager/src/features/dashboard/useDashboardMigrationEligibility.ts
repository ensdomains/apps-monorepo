import { useMemo } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { envConfig } from '@/config'
import { useMigrationEligibility } from '@/features/migration/hooks/useMigrationEligibility'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { classifyNames } from '@/features/migration/service/classifyNames'
import { useSmartAccountContext } from '@/lib/smart-account'

type UseDashboardMigrationEligibilityOptions = {
  readonly migrationEnabled?: boolean
}

const EMPTY_NAMES: ReadonlySet<string> = new Set()

/**
 * The lowercased names the migration flow can upgrade, used to label the
 * dashboard's ENSv1 rows. The rows themselves come from bigname; this reads
 * the migration feature's own name list and eligibility checks, and only
 * while migration is enabled.
 */
export const useDashboardMigrationEligibility = (
  options: UseDashboardMigrationEligibilityOptions = {},
) => {
  const { migrationEnabled = false } = options
  const { ownerAddress } = useSmartAccountContext()
  const { address } = useConnection()
  const resolvedOwnerAddress = ownerAddress ?? address
  const {
    data: v1NamesRaw,
    isPending,
    isError,
  } = useV1Names({ enabled: migrationEnabled })

  const classified = useMemo(() => {
    if (!migrationEnabled || !v1NamesRaw || !resolvedOwnerAddress) return []
    return classifyNames(
      v1NamesRaw,
      resolvedOwnerAddress as Address,
      envConfig.chain.id,
    ).classified
  }, [migrationEnabled, v1NamesRaw, resolvedOwnerAddress])

  const { data: eligibility, isPending: isEligibilityPending } =
    useMigrationEligibility(
      classified,
      migrationEnabled ? resolvedOwnerAddress : undefined,
    )

  const eligibleNames = useMemo(() => {
    if (!migrationEnabled) return EMPTY_NAMES
    return new Set(
      (eligibility?.eligible ?? classified).map((name) =>
        name.domain.name.toLowerCase(),
      ),
    )
  }, [classified, eligibility?.eligible, migrationEnabled])

  return {
    eligibleNames,
    isPending:
      migrationEnabled &&
      (isPending || (classified.length > 0 && isEligibilityPending)),
    isError: migrationEnabled && isError,
  }
}
