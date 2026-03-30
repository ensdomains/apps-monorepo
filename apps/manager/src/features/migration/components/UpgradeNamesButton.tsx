import { Trans } from '@lingui/react/macro'
import { cn } from '@/lib/utils'

export const UpgradeNamesButton = ({
  className,
  ...props
}: React.ComponentProps<'button'>) => {
  return (
    <button
      className={cn(
        'relative w-full overflow-hidden rounded-sm bg-[#5a0024] px-4 py-2.5 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[0.24px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]',
        className,
      )}
      type="button"
      {...props}
    >
      <Trans>Upgrade Names</Trans>
    </button>
  )
}
