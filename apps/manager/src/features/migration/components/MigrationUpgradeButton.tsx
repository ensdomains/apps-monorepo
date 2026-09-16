import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import surpriseCard from './assets/surprise-card.png'
import { MigrationPrimaryButton } from './MigrationPrimaryButton'

type MigrationUpgradeButtonProps = ComponentProps<'button'> & {
  readonly showNftPlaceholder?: boolean
}

export const MigrationUpgradeButton = ({
  children,
  className,
  showNftPlaceholder = false,
  ...props
}: MigrationUpgradeButtonProps) => (
  <div className={cn('relative pt-6', className)}>
    <MigrationPrimaryButton {...props} className="w-full px-14">
      {children}
    </MigrationPrimaryButton>
    {showNftPlaceholder ? (
      <span
        aria-hidden
        className="pointer-events-none absolute right-1.5 bottom-1.5 h-18.5 w-15.5 origin-bottom-right scale-80 select-none"
      >
        {/* The parent button's shadow in Figma also outlines the NFT frame. */}
        <span className="absolute top-1 left-3 h-15.5 w-11 rotate-15 rounded-sm border-[2.5px] border-ens-garnet-300" />
        <img
          alt=""
          className="relative size-full object-contain"
          draggable={false}
          height={296}
          src={surpriseCard}
          width={245}
        />
      </span>
    ) : null}
  </div>
)
