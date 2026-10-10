import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { match } from 'ts-pattern'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { resolveDashboardGraceBanner } from '@/features/grace/utils/resolveDashboardGraceBanner'
import {
  getProfileExpiryResultStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { useV1Renewable } from '@/features/renew/data/queries/v1Renewable.query'
import { useDashboardGraceNames } from '../useDashboardNames'

type DashboardGraceBannerProps = {
  readonly primaryLabel: string | null
}

export const DashboardGraceBanner = ({
  primaryLabel,
}: DashboardGraceBannerProps) => {
  // Only ENSv2 names in grace are renewed from the dashboard banner.
  const names = useDashboardGraceNames()

  const { data: primaryExpiryData } = useQuery({
    ...profileExpiryQuery(primaryLabel ?? ''),
    enabled: !!primaryLabel,
  })

  const banner = useMemo(
    () =>
      resolveDashboardGraceBanner({
        primaryLabel,
        primaryGrace: getProfileExpiryResultStatus(primaryExpiryData),
        names,
      }),
    [primaryLabel, primaryExpiryData, names],
  )
  const { isRenewable: isV1Renewable } = useV1Renewable(
    banner.show && !banner.isV2 ? [banner.renewName] : [],
  )

  return match(banner)
    .with({ show: true, isV2: false }, (visible) =>
      isV1Renewable(visible.renewName) ? (
        <GracePeriodBanner
          daysSinceExpiry={visible.daysSinceExpiry}
          graceEndDate={visible.graceEndDate}
          isV2={false}
          renewName={visible.renewName}
          renewProtocol="v1"
          variant={visible.variant}
        />
      ) : null,
    )
    .with({ show: true }, (visible) => (
      <GracePeriodBanner
        daysSinceExpiry={visible.daysSinceExpiry}
        graceEndDate={visible.graceEndDate}
        isV2={visible.isV2}
        renewName={visible.renewName}
        renewProtocol="v2"
        variant={visible.variant}
      />
    ))
    .otherwise(() => null)
}
