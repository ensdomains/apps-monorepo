import { Trans } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { shouldShowUpgradeBanner } from '@/features/migration/components/UpgradeBanner.helpers'
import { UpgradeNamesButton } from '@/features/migration/components/UpgradeNamesButton'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import { useMigratedNamesCount } from '@/features/migration/hooks/useMigratedNamesCount'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useSmartAccountContext } from '@/lib/smart-account'

type UpgradeBannerProps = {
  readonly profileName?: string
}

export const UpgradeBanner = ({ profileName }: UpgradeBannerProps) => {
  const navigate = useNavigate()
  const migrationEnabled = useFeatureFlag('MIGRATION')
  const isProfileBanner = profileName !== undefined
  const { isConnected } = useSmartAccountContext()
  const { eligible: eligibleV1Names, isPending: isV1NamesPending } =
    useEligibleV1Names({
      enabled: migrationEnabled,
      fallbackToClassified: false,
    })
  const { data: migratedCount, isPending: isMigratedCountPending } =
    useMigratedNamesCount({ enabled: migrationEnabled && !isProfileBanner })

  if (!migrationEnabled) return null
  if (!isConnected) return null
  if (isV1NamesPending || (!isProfileBanner && isMigratedCountPending)) {
    return null
  }
  if (
    !shouldShowUpgradeBanner({
      eligibleV1Names,
      migratedCount,
      profileName,
    })
  ) {
    return null
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-ens-garnet-100 to-ens-garnet-200 px-4 py-6 md:rounded-lg md:px-6 md:py-8">
      <GrainOverlay />
      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <h2 className="text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
            <Trans>Welcome to the new ENS app</Trans>
          </h2>
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <p className="text-base text-ens-garnet-500 leading-[1.2] tracking-[0.16px]">
              <Trans>
                Upgrade your name(s) to unlock your new ENS profile and claim
                your personalized NFT.
              </Trans>
            </p>
            <button
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-ens-garnet-500 text-sm uppercase leading-[1.2]"
              onClick={() => navigate({ to: '/migration' })}
              type="button"
            >
              <Trans>See what's new</Trans>
              <ArrowUpRight className="size-5" />
            </button>
          </div>
        </div>
        <UpgradeNamesButton className="w-full shrink-0 md:w-75" />
      </div>
    </div>
  )
}
