import type { ClassifiedName } from '@/features/migration/service/classifyNames'

type ShouldShowUpgradeBannerParams = {
  readonly eligibleV1Names: readonly ClassifiedName[]
  readonly gracePeriodNameCount?: number
  readonly wrapperSyncNames?: readonly ClassifiedName[]
  readonly migratedCount: number | null | undefined
  readonly profileName?: string
}

const normalizeName = (name: string) => name.trim().toLowerCase()

export const isEligibleProfileName = (
  eligibleV1Names: readonly ClassifiedName[],
  profileName: string,
) => {
  const normalizedProfileName = normalizeName(profileName)
  return eligibleV1Names.some(
    ({ domain }) => normalizeName(domain.name) === normalizedProfileName,
  )
}

export const shouldShowUpgradeBanner = ({
  eligibleV1Names,
  gracePeriodNameCount = 0,
  wrapperSyncNames = [],
  migratedCount,
  profileName,
}: ShouldShowUpgradeBannerParams): boolean => {
  if (profileName !== undefined) {
    return (
      isEligibleProfileName(eligibleV1Names, profileName) ||
      isEligibleProfileName(wrapperSyncNames, profileName)
    )
  }
  if (
    eligibleV1Names.length + gracePeriodNameCount + wrapperSyncNames.length ===
    0
  )
    return false
  if ((migratedCount ?? 0) >= 1) return false
  return true
}

/** Preparation changes the entry copy, while these names stay out of migration selection. */
export const getUpgradeBannerPreparation = ({
  eligibleV1Names,
  gracePeriodNameCount = 0,
  wrapperSyncNames = [],
  profileName,
}: Pick<
  ShouldShowUpgradeBannerParams,
  | 'eligibleV1Names'
  | 'gracePeriodNameCount'
  | 'wrapperSyncNames'
  | 'profileName'
>): {
  readonly shouldSyncNames: boolean
  readonly shouldRenewNames: boolean
} => ({
  shouldSyncNames:
    profileName === undefined
      ? eligibleV1Names.length === 0 &&
        gracePeriodNameCount === 0 &&
        wrapperSyncNames.length > 0
      : isEligibleProfileName(wrapperSyncNames, profileName),
  shouldRenewNames:
    profileName === undefined &&
    eligibleV1Names.length === 0 &&
    gracePeriodNameCount > 0,
})
