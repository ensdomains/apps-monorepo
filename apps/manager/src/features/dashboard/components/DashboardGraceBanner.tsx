import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { useWallet } from '@getpara/react-sdk-lite'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { match } from 'ts-pattern'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { resolveDashboardGraceBanner } from '@/features/grace/utils/resolveDashboardGraceBanner'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import {
  getProfileNameExpiryStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { getAllDomainsInfiniteQuery } from '../service/queries/getAllDashboardDomains'

type DashboardGraceBannerProps = {
  readonly primaryLabel: string | null
}

export const DashboardGraceBanner = ({
  primaryLabel,
}: DashboardGraceBannerProps) => {
  const migrationEnabled = useFeatureFlag('MIGRATION')
  const { data: wallet } = useWallet()
  const smartAccount = useSmartAccountContextSafe()

  const ownerAddresses = useMemo(() => {
    const candidates = [
      wallet?.address,
      smartAccount?.accountAddress,
      smartAccount?.ownerAddress,
    ]
    const unique = new Set<string>()
    for (const addr of candidates) {
      if (addr) unique.add(addr.toLowerCase())
    }
    return Array.from(unique)
  }, [
    wallet?.address,
    smartAccount?.accountAddress,
    smartAccount?.ownerAddress,
  ])

  const hasOwnerAddresses = ownerAddresses.length > 0

  const { data: v2Data } = useInfiniteQuery(
    getAllDomainsInfiniteQuery(
      hasOwnerAddresses
        ? {
            where: { owner_in: ownerAddresses },
            orderBy: Domain_OrderBy.ExpiryDate,
            orderDirection: OrderDirection.Asc,
          }
        : undefined,
    ),
  )

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
        primaryGrace: getProfileNameExpiryStatus(
          primaryExpiryData?.expiry,
          true,
        ),
        v2Names: v2Data ?? [],
        v1Classified: migrationEnabled ? v1Classified : [],
      }),
    [
      primaryLabel,
      primaryExpiryData?.expiry,
      v1Classified,
      v2Data,
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
