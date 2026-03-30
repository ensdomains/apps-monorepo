import { Trans } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export const UpgradeNamesButton = ({
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'onClick'>) => {
  const navigate = useNavigate()

  return (
    <button
      className={cn(
        'relative w-full overflow-hidden rounded-sm bg-ens-garnet-900 px-4 py-2.5 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[0.24px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]',
        className,
      )}
      onClick={() => navigate({ to: '/migration' })}
      type="button"
      {...props}
    >
      <Trans>Upgrade Names</Trans>
    </button>
  )
}
