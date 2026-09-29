import { Plural, Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useNavigate } from '@tanstack/react-router'
import { match } from 'ts-pattern'
import { useVisibleCommemorativeNftStatus } from '@/features/migration/commemorative-nft/useVisibleCommemorativeNftEligibility'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { MigrationUpgradeButton } from '@/features/migration/components/MigrationUpgradeButton'
import { shouldShowUpgradeBanner } from '@/features/migration/components/UpgradeBanner.helpers'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import { useMigratedNamesCount } from '@/features/migration/hooks/useMigratedNamesCount'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { useSmartAccountContext } from '@/lib/smart-account'
import { cn } from '@/lib/utils'

type UpgradeBannerProps = {
  readonly className?: string
  readonly profileName?: string
}

export const UpgradeBanner = ({
  className,
  profileName,
}: UpgradeBannerProps) => {
  const navigate = useNavigate()
  const migrationEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.MIGRATION,
    false,
  )
  const { eligibility: nftEligibility, isConfirmedUnclaimed } =
    useVisibleCommemorativeNftStatus({ enabled: migrationEnabled })
  const nftCopyEnabled = !!nftEligibility
  const isProfileBanner = profileName !== undefined
  const { isConnected } = useSmartAccountContext()
  const {
    eligible: eligibleV1Names,
    gracePeriodNames,
    isPending: isV1NamesPending,
  } = useEligibleV1Names({
    enabled: migrationEnabled,
    fallbackToClassified: false,
  })
  const nameCount = eligibleV1Names.length
  const gracePeriodNameCount = gracePeriodNames.length
  const shouldRenewNames = !isProfileBanner && nameCount === 0
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
      gracePeriodNameCount,
      migratedCount,
      profileName,
    })
  ) {
    return null
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 px-4 py-6 md:rounded-lg md:px-5 md:py-5.5',
        className,
      )}
    >
      <GrainOverlay />
      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <h2 className="text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
            {isProfileBanner ? (
              <Trans>This name can’t be edited</Trans>
            ) : (
              <Trans>Welcome to the new ENS app</Trans>
            )}
          </h2>
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <p className="text-base text-ens-garnet-500 leading-[1.2] tracking-[0.16px]">
              {match({ isProfileBanner, nftCopyEnabled, shouldRenewNames })
                .with({ shouldRenewNames: true }, () => (
                  <Plural
                    one="Renew your grace-period name before upgrading to your new ENS profile."
                    other="Renew your # grace-period names before upgrading to your new ENS profile."
                    value={gracePeriodNameCount}
                  />
                ))
                .with({ isProfileBanner: true, nftCopyEnabled: true }, () => (
                  <Trans>
                    Upgrade your name to edit your new ENS profile and claim
                    your personalized NFT.
                  </Trans>
                ))
                .with({ isProfileBanner: true, nftCopyEnabled: false }, () => (
                  <Trans>Upgrade your name to edit your new ENS profile.</Trans>
                ))
                .with({ isProfileBanner: false, nftCopyEnabled: true }, () => (
                  <Plural
                    one="Upgrade your name to unlock your new ENS profile and claim your personalized NFT."
                    other="Upgrade your names to unlock your new ENS profile and claim your personalized NFT."
                    value={nameCount}
                  />
                ))
                .with({ isProfileBanner: false, nftCopyEnabled: false }, () => (
                  <Plural
                    one="Upgrade your name to unlock your new ENS profile."
                    other="Upgrade your names to unlock your new ENS profile."
                    value={nameCount}
                  />
                ))
                .exhaustive()}
            </p>
          </div>
          {!isProfileBanner && !shouldRenewNames && gracePeriodNameCount > 0 ? (
            <p className="text-base text-ens-garnet-500 leading-[1.2] tracking-[0.16px]">
              <Plural
                one="# name needs renewal before it can be upgraded."
                other="# names need renewal before they can be upgraded."
                value={gracePeriodNameCount}
              />
            </p>
          ) : null}
        </div>
        <MigrationUpgradeButton
          className="w-full shrink-0 md:w-75"
          onClick={() => navigate({ to: '/migration' })}
          showNftPlaceholder={
            !shouldRenewNames && nftCopyEnabled && isConfirmedUnclaimed
          }
          type="button"
        >
          {shouldRenewNames ? (
            <Trans>Renew Names</Trans>
          ) : (
            <Trans>Upgrade Names</Trans>
          )}
        </MigrationUpgradeButton>
      </div>
    </div>
  )
}
