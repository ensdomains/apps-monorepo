import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { DAI, USDCIcon, USDTIcon } from '@/components/atoms/StableCoinsIcons'
import { Button } from '@/components/ens-consumer/button/Button'
import { MSymbol } from '@/components/ui/material-symbol'
import { SECONDS_IN_YEAR } from '@/features/register-v2/utils/time'
import { tw } from '@/utils/tailwind'
import { DurationCustomRow } from './DurationCustomRow'
import { DurationPresetRow } from './DurationPresetRow'
import { PRESET_DURATIONS } from './DurationSelector'
import { PaymentCardPremiumLine } from './PaymentCardPremiumLine'
import { PriceCooldownBanner } from './PriceCooldownBanner/PriceCooldownBanner'
import type { PriceCooldownBannerProps } from './PriceCooldownBanner/types'
import { PricingDomainHeader } from './PricingDomainHeader'

export type PricingStepScreenProps = {
  label: string
  banner: PriceCooldownBannerProps
  /** Preset duration totals keyed by seconds (e.g. 1y / 3y / 6y). */
  presetPrices: Record<number, number>
  selectedDuration: number
  durationLabel: string
  expirationDateLabel: string
  totalAmount: number
  premiumAmount: number
  discountAmount?: number
  showBackButton?: boolean
}

const PricingSummaryCardStatic = ({
  durationLabel,
  expirationDateLabel,
}: {
  durationLabel: string
  expirationDateLabel: string
}) => (
  <div className="flex flex-col items-center justify-center gap-1 rounded-xl border-[#DDDDDE] border-[0.5px] bg-white px-6 py-8 text-center font-[350] text-neutral-800 text-xl leading-ens-none shadow-temp-card md:py-6 md:text-2xl">
    <div>
      <Trans>Registering for</Trans>{' '}
      <span className="font-[425] text-[#024A70]">{durationLabel}</span>
    </div>
    <div>
      <Trans>expiring on</Trans>{' '}
      <span className="font-[425] text-[#024A70]">{expirationDateLabel}</span>
    </div>
  </div>
)

const PaymentCardStatic = ({
  totalAmount,
  premiumAmount,
  discountAmount,
}: {
  totalAmount: number
  premiumAmount: number
  discountAmount?: number
}) => (
  <div
    className={tw(
      'flex flex-1 flex-col items-center justify-between gap-8',
      'rounded-xl border-[#DDDDDE] border-[0.5px] bg-white px-6 py-6 shadow-temp-card md:px-12',
    )}
  >
    <div className="w-full max-w-55 space-y-3 text-center">
      {premiumAmount > 0 && (
        <PaymentCardPremiumLine
          isLoading={false}
          premiumAmount={premiumAmount}
        />
      )}
      <p className="text-ens-lapis-surface text-xs uppercase">
        <Trans>Total</Trans>
      </p>
      <div className="flex items-end justify-center gap-1.5">
        <span className="font-medium text-4xl text-ens-blue-midnight leading-ens-none md:text-5xl">
          $
          {totalAmount.toLocaleString('en-US', {
            maximumFractionDigits: 0,
          })}
        </span>
        <span className="font-normal text-base text-ens-blue-midnight leading-7">
          <Trans>USD</Trans>
        </span>
      </div>
      {discountAmount !== undefined && discountAmount > 0 && (
        <div className="w-full rounded bg-ens-signal-success-300 px-4 py-2">
          <span className="font-normal text-2xl text-ens-peridot-core leading-ens-none">
            <Trans>
              Save $
              {discountAmount.toLocaleString('en-US', {
                maximumFractionDigits: 0,
              })}
            </Trans>
          </span>
        </div>
      )}
    </div>
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-center font-normal text-ens-gray text-xs tracking-tight">
          <Trans>Stables accepted</Trans>
        </p>
        <div className="flex items-center gap-1">
          <USDTIcon className="h-7 w-7" />
          <USDCIcon className="h-7 w-7" />
          <DAI className="h-7 w-7" />
        </div>
      </div>
      <Button
        className="w-full font-medium font-mono uppercase tracking-widest"
        color="blue"
        size="lg"
        type="button"
      >
        <Trans>Pay with stablecoins</Trans>
      </Button>
    </div>
  </div>
)

const DurationSelectorStatic = ({
  presetPrices,
  selectedDuration,
  onSelectDuration,
}: {
  presetPrices: Record<number, number>
  selectedDuration: number
  onSelectDuration: (duration: number) => void
}) => {
  const selectedPresetIdx = PRESET_DURATIONS.findIndex(
    ({ duration }) => duration === selectedDuration,
  )

  return (
    <div className="flex h-full flex-col justify-between gap-3 rounded-xl border-[#DDDDDE] border-[0.5px] bg-white p-3 shadow-temp-card">
      {PRESET_DURATIONS.map((data, idx) => (
        <DurationPresetRow
          data={data}
          isLoading={false}
          isSelected={idx === selectedPresetIdx}
          key={data.duration}
          onSelect={() => onSelectDuration(data.duration)}
          price={presetPrices[data.duration]}
        />
      ))}
      <DurationCustomRow
        isSelected={selectedPresetIdx === -1}
        onDurationSet={onSelectDuration}
        selectedDuration={selectedDuration}
        type="register"
      />
    </div>
  )
}

/**
 * Provider-free pricing step layout for Storybook and design review.
 * Mirrors {@link PricingStep} without registration machine or contract queries.
 */
export const PricingStepScreen = ({
  label,
  banner,
  presetPrices,
  selectedDuration: selectedDurationProp,
  durationLabel,
  expirationDateLabel,
  totalAmount,
  premiumAmount,
  discountAmount,
  showBackButton = true,
}: PricingStepScreenProps) => {
  const [selectedDuration, setSelectedDuration] = useState(selectedDurationProp)

  return (
    <div className="relative mx-auto mt-12 mb-4 w-full max-w-6xl space-y-6.5 px-4 md:px-0">
      {showBackButton && (
        <div
          aria-hidden
          className="absolute top-5 left-4 flex items-center gap-2 text-ens-lapis-core uppercase md:left-10 xl:top-7"
        >
          <MSymbol className="ms-opsz-24 ms-wght-500" symbol="arrow_back" />
          <span className="font-medium text-sm leading-ens-none max-xl:hidden">
            <Trans>Back</Trans>
          </span>
        </div>
      )}

      <PricingDomainHeader label={label} />
      <PriceCooldownBanner {...banner} />

      <div className="grid grid-cols-1 gap-1.5 md:gap-2 lg:grid-cols-[2fr_420px] lg:items-stretch">
        <DurationSelectorStatic
          onSelectDuration={setSelectedDuration}
          presetPrices={presetPrices}
          selectedDuration={selectedDuration}
        />
        <div className="flex flex-col gap-1.5 md:gap-2">
          <PricingSummaryCardStatic
            durationLabel={durationLabel}
            expirationDateLabel={expirationDateLabel}
          />
          <PaymentCardStatic
            discountAmount={discountAmount}
            premiumAmount={premiumAmount}
            totalAmount={totalAmount}
          />
        </div>
      </div>
    </div>
  )
}

/** Figma-aligned mock for erni.eth price-cooldown registration pricing. */
export const ERNI_PRICE_COOLDOWN_MOCK = {
  label: 'erni',
  presetPrices: {
    [SECONDS_IN_YEAR]: 160,
    [SECONDS_IN_YEAR * 3]: 330,
    [SECONDS_IN_YEAR * 6]: 540,
  } satisfies Record<number, number>,
  selectedDuration: SECONDS_IN_YEAR * 3,
  durationLabel: '3 years',
  expirationDateLabel: 'November 19, 2028',
  totalAmount: 47_982,
  premiumAmount: 47_800,
  discountAmount: 150,
  banner: {
    basePricePerYearLabel: '$8/year',
    currentPremiumLabel: '$4,720',
    premiumEndsAtLabel: 'August 28, 2026 at 2:30 PM',
    periodDays: 21,
    chartStartLabel: '$100M',
    chartWindowProgress: 0.22,
    timezoneLabel: 'UTC-07:00',
    targetPriceInput: '4,270,540.82',
    onTargetPriceInputChange: () => {},
    targetPriceReachLabel: (
      <>
        The fee will reach $4,270,540.82 on{' '}
        <span className="text-[#353535]">August 8, 2026 at 3:30 AM.</span>
      </>
    ),
    favoriteCount: 425,
    searchCount30d: 40,
  } satisfies PriceCooldownBannerProps,
} as const
