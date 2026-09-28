import { Plural, Trans } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { match } from 'ts-pattern'
import { useVisibleCommemorativeNftStatus } from '@/features/migration/commemorative-nft/useVisibleCommemorativeNftEligibility'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { MigrationUpgradeButton } from '@/features/migration/components/MigrationUpgradeButton'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import { useMigratedNamesCount } from '@/features/migration/hooks/useMigratedNamesCount'
import { useSmartAccountContext } from '@/lib/smart-account'

export const MigrationProgressBanner = () => {
  const { eligibility: nftEligibility, isConfirmedUnclaimed } =
    useVisibleCommemorativeNftStatus()
  const nftCopyEnabled = !!nftEligibility
  const navigate = useNavigate()
  const { isConnected } = useSmartAccountContext()
  const {
    eligible: eligibleV1Names,
    gracePeriodNames,
    isPending: isV1Pending,
  } = useEligibleV1Names()
  const { data: migratedCount, isPending: isCountPending } =
    useMigratedNamesCount()

  if (!isConnected) return null
  if (isV1Pending || isCountPending) return null

  const migrated = migratedCount ?? 0
  const remaining = eligibleV1Names.length
  const gracePeriodNameCount = gracePeriodNames.length
  const needsRenewal = remaining === 0
  const total = migrated + remaining

  if (migrated < 1 || (remaining < 1 && gracePeriodNameCount < 1)) return null

  const progressPercent = Math.min(100, Math.max(0, (migrated / total) * 100))

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-ens-garnet-100 to-ens-garnet-200 px-4 py-6 md:rounded-lg md:px-6 md:py-8">
      <GrainOverlay />
      <div className="relative z-10 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="font-semi-mono text-[10px] text-ens-garnet-500 uppercase leading-[1.2] tracking-[0.2px]">
            <Trans>
              {migrated} out of {total} names upgraded
            </Trans>
          </p>
          <div
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(progressPercent)}
            className="relative h-1 w-full overflow-hidden rounded-full bg-ens-garnet-500"
            role="progressbar"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-ens-garnet-900 transition-[width] duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <h2 className="text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
              {needsRenewal ? (
                <Trans>Renew before completing your upgrade</Trans>
              ) : (
                <Trans>You're almost there!</Trans>
              )}
            </h2>
            <p className="text-base text-ens-garnet-500 leading-[1.2] tracking-[0.16px]">
              {match({ needsRenewal, nftCopyEnabled })
                .with({ needsRenewal: true }, () => (
                  <Plural
                    one="Renew your grace-period name before completing your upgrade."
                    other="Renew your # grace-period names before completing your upgrade."
                    value={gracePeriodNameCount}
                  />
                ))
                .with({ nftCopyEnabled: true }, () => (
                  <Trans>
                    Complete upgrade and receive a collectible marking your
                    place in ENS history.
                  </Trans>
                ))
                .otherwise(() => (
                  <Trans>
                    Complete upgrade to unlock your new ENS profile.
                  </Trans>
                ))}
            </p>
            {!needsRenewal && gracePeriodNameCount > 0 ? (
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
            className="w-full shrink-0 md:w-[338px]"
            onClick={() => navigate({ to: '/migration' })}
            showNftPlaceholder={
              !needsRenewal && nftCopyEnabled && isConfirmedUnclaimed
            }
            type="button"
          >
            {needsRenewal ? (
              <Trans>Renew Names</Trans>
            ) : (
              <Trans>Complete Upgrade</Trans>
            )}
          </MigrationUpgradeButton>
        </div>
      </div>
    </div>
  )
}
