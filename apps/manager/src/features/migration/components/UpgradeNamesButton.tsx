import { Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useNavigate } from '@tanstack/react-router'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { cn } from '@/lib/utils'
import { MigrationPrimaryButton } from './MigrationPrimaryButton'

export const UpgradeNamesButton = ({
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'onClick'>) => {
  const navigate = useNavigate()
  const migrationEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.MIGRATION,
    false,
  )

  return (
    <MigrationPrimaryButton
      {...props}
      className={cn('w-full', className)}
      disabled={!migrationEnabled || props.disabled}
      onClick={() => {
        if (migrationEnabled) navigate({ to: '/migration' })
      }}
      type="button"
    >
      <Trans>Upgrade Names</Trans>
    </MigrationPrimaryButton>
  )
}
