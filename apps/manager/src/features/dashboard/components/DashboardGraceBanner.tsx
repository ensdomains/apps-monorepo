import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { match } from 'ts-pattern'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { resolveDashboardGraceBanner } from '@/features/grace/utils/resolveDashboardGraceBanner'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import {
  getProfileExpiryResultStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useOwnedDomains } from '../useOwnedDomains'

type DashboardGraceBannerProps = {
  readonly primaryLabel: string | null
}

export const DashboardGraceBanner = ({
  primaryLabel,
}: DashboardGraceBannerProps) => {
  const migrationEnabled = useFeatureFlag('MIGRATION')
  const { v2Names, isAllPagesLoaded } = useOwnedDomains()

  const { eligible: v1Classified } = useEligibleV1Names({
    enabled: migrationEnabled,
  })

  const { data: primaryExpiryData } = useQuery({
    ...profileExpiryQuery(primaryLabel ?? ''),
    enabled: !!primaryLabel,
  })

  const banner = useMemo(
    () =>
      resolveDashboardGraceBanner({
        primaryLabel,
        primaryGrace: getProfileExpiryResultStatus(primaryExpiryData),
        // Wait for all indexer pages before scanning for non-primary grace names.
        v2Names: isAllPagesLoaded ? v2Names : [],
        v1Classified: migrationEnabled ? v1Classified : [],
      }),
    [
      primaryLabel,
      primaryExpiryData,
      v1Classified,
      v2Names,
      isAllPagesLoaded,
      migrationEnabled,
    ],
  )

  return match(banner)
    .with({ show: true }, (visible) => (
      <GracePeriodBanner
        daysSinceExpiry={visible.daysSinceExpiry}
        graceEndDate={visible.graceEndDate}
        isV2={visible.isV2}
        renewName={visible.renewName}
        variant={visible.variant}
      />
    ))
    .otherwise(() => null)
}
