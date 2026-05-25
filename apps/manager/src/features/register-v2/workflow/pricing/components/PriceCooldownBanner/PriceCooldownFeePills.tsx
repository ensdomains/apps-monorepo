import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { tw } from '@/utils/tailwind'

const pillShadow =
  'shadow-[inset_0px_0px_4px_0px_rgba(198,223,233,0.3)]' as const

type FeePillProps = {
  label: ReactNode
  value: string
  variant: 'base' | 'premium'
  showDecayIcon?: boolean
  layout?: 'row' | 'column'
}

const FeePill = ({
  label,
  value,
  variant,
  showDecayIcon = false,
  layout = 'row',
}: FeePillProps) => (
  <div
    className={tw(
      'relative rounded-xl px-4 py-3',
      variant === 'base' ? 'bg-[#effafe]' : 'bg-ens-lapis-100',
      pillShadow,
      layout === 'column' &&
        'flex min-h-[78px] flex-col items-center justify-center gap-1.5',
    )}
  >
    <span className="font-medium text-[#595755] text-xs leading-normal tracking-tight">
      {label}
    </span>
    <div className="flex items-center gap-0.5">
      <span
        className={tw(
          'font-medium font-mono text-base leading-normal tracking-tight',
          variant === 'premium' ? 'text-ens-lapis-500' : 'text-[#1d293d]',
        )}
      >
        {value}
      </span>
      {showDecayIcon && (
        <MSymbol
          className="ms-opsz-20 ms-wght-300 rotate-180 text-ens-lapis-400"
          symbol="keyboard_arrow_down"
        />
      )}
    </div>
  </div>
)

type PriceCooldownFeePillsProps = {
  basePricePerYearLabel: string
  currentPremiumLabel: string
  layout: 'desktop' | 'mobile'
}

export const PriceCooldownFeePills = ({
  basePricePerYearLabel,
  currentPremiumLabel,
  layout,
}: PriceCooldownFeePillsProps) => {
  if (layout === 'desktop') {
    return (
      <>
        <FeePill
          label={<Trans>Base price</Trans>}
          value={basePricePerYearLabel}
          variant="base"
        />
        <FeePill
          label={<Trans>Additional fee</Trans>}
          showDecayIcon
          value={currentPremiumLabel}
          variant="premium"
        />
      </>
    )
  }

  return (
    <>
      <FeePill
        label={<Trans>Fee at this moment</Trans>}
        layout="column"
        showDecayIcon
        value={currentPremiumLabel}
        variant="premium"
      />
      <FeePill
        label={<Trans>Base price</Trans>}
        layout="column"
        value={basePricePerYearLabel}
        variant="base"
      />
    </>
  )
}
