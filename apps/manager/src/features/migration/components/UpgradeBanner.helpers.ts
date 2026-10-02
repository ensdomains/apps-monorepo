import type { ClassifiedName } from '@/features/migration/service/classifyNames'

type ShouldShowUpgradeBannerParams = {
  readonly eligibleV1Names: readonly ClassifiedName[]
  readonly gracePeriodNameCount?: number
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
  migratedCount,
  profileName,
}: ShouldShowUpgradeBannerParams): boolean => {
  if (profileName !== undefined) {
    return isEligibleProfileName(eligibleV1Names, profileName)
  }
  if (eligibleV1Names.length + gracePeriodNameCount === 0) return false
  if ((migratedCount ?? 0) >= 1) return false
  return true
}
