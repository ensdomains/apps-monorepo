import { Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useNavigate } from '@tanstack/react-router'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { cn } from '@/lib/utils'
import { MigrationUpgradeButton } from './MigrationUpgradeButton'

export const UpgradeNamesButton = ({
  className,
  showNftPlaceholder = false,
  ...props
}: Omit<React.ComponentProps<'button'>, 'onClick'> & {
  readonly showNftPlaceholder?: boolean
}) => {
  const navigate = useNavigate()
  const migrationEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.MIGRATION,
    false,
  )

  return (
    <MigrationUpgradeButton
      {...props}
      className={cn('w-full', className)}
      disabled={!migrationEnabled || props.disabled}
      onClick={() => {
        if (migrationEnabled) navigate({ to: '/migration', search: {} })
      }}
      showNftPlaceholder={showNftPlaceholder}
      type="button"
    >
      <Trans>Upgrade Names</Trans>
    </MigrationUpgradeButton>
  )
}
