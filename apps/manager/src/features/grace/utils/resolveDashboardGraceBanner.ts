import { match, P } from 'ts-pattern'
import { compareDashboardNames } from '@/features/dashboard/dashboardNames'
import {
  type DashboardName,
  mergedRowMetadata,
  toMergedItems,
} from '@/features/dashboard/mergedNames'
import type { GracePeriodBannerVariant } from '@/features/grace/components/GracePeriodBanner'
import type { NameExpiryStatus } from '@/features/grace/utils/gracePeriod'

export type DashboardGraceBannerState =
  | {
      readonly show: true
      readonly variant: GracePeriodBannerVariant
      readonly renewName: string
      readonly graceEndDate: Date
      readonly daysSinceExpiry: number | null
      readonly isV2: boolean
    }
  | { readonly show: false }

type ResolveDashboardGraceBannerParams = {
  readonly primaryLabel: string | null
  readonly primaryGrace: NameExpiryStatus
  readonly names: readonly DashboardName[]
}

const isPrimaryLabelMatch = (
  primaryLabel: string | null,
  name: string,
): boolean =>
  !!primaryLabel && name.toLowerCase() === primaryLabel.toLowerCase()

const resolveAnyNameGraceBanner = ({
  primaryLabel,
  names,
}: Omit<ResolveDashboardGraceBannerParams, 'primaryGrace'>): Extract<
  DashboardGraceBannerState,
  { show: true }
> | null => {
  for (const item of toMergedItems(
    [...names].sort(compareDashboardNames('expiry', 'asc')),
  )) {
    const meta = mergedRowMetadata(item, primaryLabel)
    if (
      meta.isV1 ||
      !meta.isInGrace ||
      !meta.graceEndDate ||
      isPrimaryLabelMatch(primaryLabel, meta.label)
    ) {
      continue
    }

    return {
      show: true as const,
      variant: 'anyNameExpired' as const,
      renewName: meta.label,
      graceEndDate: meta.graceEndDate,
      daysSinceExpiry: meta.daysSinceExpiry,
      isV2: !meta.isV1,
    }
  }

  return null
}

export const resolveDashboardGraceBanner = (
  params: ResolveDashboardGraceBannerParams,
): DashboardGraceBannerState =>
  match({
    primaryLabel: params.primaryLabel,
    primaryGrace: params.primaryGrace,
  })
    .with(
      {
        primaryLabel: P.string,
        primaryGrace: {
          isInGrace: true,
          graceEndDate: P.not(P.nullish),
        },
      },
      ({ primaryLabel, primaryGrace: { graceEndDate, daysSinceExpiry } }) => ({
        show: true as const,
        variant: 'primaryExpired' as const,
        renewName: primaryLabel,
        graceEndDate,
        daysSinceExpiry,
        // Reverse primary names in manager are v2 registrations.
        isV2: true,
      }),
    )
    .otherwise(() => {
      const anyNameBanner = resolveAnyNameGraceBanner(params)
      return anyNameBanner ?? { show: false as const }
    })
