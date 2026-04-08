import { Trans } from '@lingui/react/macro'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { UpgradeNamesButton } from './UpgradeNamesButton'

type UpgradeNamesButtonWithNFTProps = {
  readonly className?: string
  readonly buttonClassName?: string
  readonly onClick?: ComponentProps<'button'>['onClick']
  readonly disabled?: boolean
}

export const UpgradeNamesButtonWithNFT = ({
  className,
  buttonClassName,
  onClick,
  disabled,
}: UpgradeNamesButtonWithNFTProps) => (
  <div className={cn('relative', className)}>
    <img
      alt=""
      className="-top-6 pointer-events-none absolute right-3.5 z-10 w-10 rotate-[20deg]"
      src="/icons/nft.png"
    />
    {onClick ? (
      <button
        className={cn(
          'relative w-full overflow-hidden rounded-sm bg-ens-garnet-900 px-4 py-2.5 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[0.24px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)] disabled:opacity-50',
          buttonClassName,
        )}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <Trans>Upgrade Names</Trans>
      </button>
    ) : (
      <UpgradeNamesButton className={cn('w-full', buttonClassName)} />
    )}
  </div>
)
