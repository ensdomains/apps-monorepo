import { Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { Card } from '@/components/ui/card'
import { MigrationApprovalSettings } from '@/features/migration/components/MigrationApprovalSettings'
import { UpgradeNamesButton } from '@/features/migration/components/UpgradeNamesButton'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { useSmartAccountContext } from '@/lib/smart-account'
import { cn } from '@/lib/utils'

export const MigrationPermissionsPage = () => {
  const isMigrationEnabled =
    useFeatureFlagEnabled(POSTHOG_FEATURE_FLAGS.MIGRATION, false) === true
  const { isConnected, ownerAddress } = useSmartAccountContext()
  const canCheckNames = isMigrationEnabled && isConnected && !!ownerAddress
  const { eligible, isPending } = useEligibleV1Names({
    enabled: canCheckNames,
    fallbackToClassified: false,
  })
  const hasNamesToUpgrade = canCheckNames && !isPending && eligible.length > 0

  return (
    <div className="mx-auto w-full max-w-5xl px-2 py-8 lg:my-5">
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-normal text-foreground text-temp-32px leading-ens-none">
            <Trans>Upgrade permissions</Trans>
          </h1>
          <UpgradeNamesButton
            className={cn(
              'w-full shrink-0 pt-0 sm:w-auto',
              !hasNamesToUpgrade && 'invisible',
            )}
            disabled={!hasNamesToUpgrade}
          />
        </div>
        <p className="text-base text-muted-foreground">
          <Trans>Review access granted during ENS name upgrades.</Trans>
        </p>
      </div>
      <Card className="block p-6">
        <MigrationApprovalSettings />
      </Card>
    </div>
  )
}
