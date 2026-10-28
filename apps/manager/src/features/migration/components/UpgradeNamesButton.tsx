import { Trans } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
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

  return (
    <MigrationUpgradeButton
      {...props}
      className={cn('w-full', className)}
      onClick={() => navigate({ to: '/upgrade' })}
      showNftPlaceholder={showNftPlaceholder}
      type="button"
    >
      <Trans>Upgrade Names</Trans>
    </MigrationUpgradeButton>
  )
}
