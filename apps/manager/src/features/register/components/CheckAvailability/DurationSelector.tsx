import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { useRef, useState } from 'react'
import type {
  PricingDuration,
  PricingOptions,
} from '@/features/register/components/Pricing/types'
import {
  formatYears,
  MIN_REGISTER_DURATION_YEARS,
} from '@/features/register/components/Pricing/utils'
import { cn } from '@/lib/utils'

type DurationSelectorProps = {
  pricing: PricingOptions
  selectedDuration: number | null
  onSelect: (duration: number) => void
  disabled?: boolean
  durationInputValue: string
  onInputChange: (value: string) => void
}

const durationOrder: PricingDuration[] = [1, 3, 5, 10]

export const DurationSelector = ({
  pricing,
  selectedDuration,
  onSelect,
  disabled,
  durationInputValue,
  onInputChange,
}: DurationSelectorProps) => {
  const { t } = useLingui()
  const [isCustomFocused, setIsCustomFocused] = useState(false)
  const [customDisplayValue, setCustomDisplayValue] = useState('')
  const customInputRef = useRef<HTMLInputElement>(null)

  const isPredefinedDuration = (
    duration: number | null,
  ): duration is PricingDuration => {
    return (
      duration !== null && durationOrder.includes(duration as PricingDuration)
    )
  }

  const handlePredefinedSelect = (duration: PricingDuration) => {
    onSelect(duration)
  }

  const handleCustomInputFocus = () => {
    setIsCustomFocused(true)
    // If coming from a predefined duration, start with empty input
    if (isPredefinedDuration(selectedDuration)) {
      setCustomDisplayValue('')
    } else {
      // If already on custom duration, use the current value
      setCustomDisplayValue(durationInputValue)
    }
  }

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCustomDisplayValue(value)

    // Allow clearing the input
    if (value === '') {
      onInputChange('')
      return
    }

    const normalizedValue = value.replace(',', '.')

    // Only allow positive numbers with optional decimal
    if (!/^\d*\.?\d*$/.test(normalizedValue)) {
      return
    }

    const parsed = parseFloat(normalizedValue)
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1000) {
      onInputChange(normalizedValue)
      if (parsed > 0) {
        onSelect(Math.max(MIN_REGISTER_DURATION_YEARS, parsed))
      }
    }
  }

  const handleCustomInputBlur = () => {
    setIsCustomFocused(false)
    // If empty on blur, reset to the minimum allowed duration
    if (customDisplayValue === '') {
      onSelect(MIN_REGISTER_DURATION_YEARS)
      onInputChange(formatYears(MIN_REGISTER_DURATION_YEARS))
      return
    }

    const parsed = parseFloat(customDisplayValue)
    if (!Number.isNaN(parsed)) {
      const clamped = Math.min(
        1000,
        Math.max(MIN_REGISTER_DURATION_YEARS, parsed),
      )
      onSelect(clamped)
      onInputChange(formatYears(clamped))
    }
  }

  const isCustomSelected =
    selectedDuration !== null && !isPredefinedDuration(selectedDuration)

  // Map discount badges to darker colors for higher durations
  const getBadgeColor = (duration: PricingDuration) => {
    switch (duration) {
      case 3:
        return 'bg-slate-500'
      case 5:
        return 'bg-slate-600'
      case 10:
        return 'bg-slate-700'
      default:
        return 'bg-slate-400'
    }
  }

  return (
    <div className="flex h-full flex-col justify-between gap-1 md:gap-2">
      {durationOrder.map((duration) => {
        const option = pricing[duration]
        const isSelected = duration === selectedDuration && !isCustomFocused

        const formattedTotalPrice = (option.total ?? 0).toLocaleString(
          'en-US',
          {
            maximumFractionDigits: 0,
          },
        )

        return (
          <button
            aria-pressed={isSelected}
            className={cn(
              'group relative',
              'flex h-[58px] w-full items-center justify-between md:h-[100px]',
              'px-3 py-4 md:px-5 md:py-8',
              'rounded-lg border border-ens-gray-three hover:border-ens-blue disabled:hover:border-ens-gray-three aria-pressed:border-ens-blue md:rounded-xl',
              'bg-ens-white transition-all',
              'aria-pressed:hover:border-ens-blue',
              'disabled:cursor-not-allowed disabled:opacity-60',
              'focus-visible:outline-2 focus-visible:outline-offset-2',
              'focus-visible:outline-ens-blue',
            )}
            disabled={disabled}
            key={duration}
            onClick={() => handlePredefinedSelect(duration)}
            type="button"
          >
            {/* Left: Year label */}
            <div className="flex w-[50%] items-center gap-3 md:w-[60%] md:gap-5 lg:w-[40%] xl:w-[60%]">
              <span className="font-normal text-ens-blue-dark text-sm leading-none tracking-tighter md:text-2xl">
                <Plural one="# year" other="# years" value={duration} />
              </span>
            </div>

            {/* Right: Discount badge + Price */}
            <div className="flex w-[50%] items-center justify-between gap-2 md:w-[40%] md:gap-3 lg:w-[60%] xl:w-[40%]">
              {option.discount > 0 ? (
                <div
                  className={cn(
                    getBadgeColor(duration),
                    'flex items-center justify-center rounded-xs px-1 py-0.5 md:px-1.5 md:py-1',
                  )}
                >
                  <span className="font-medium text-white text-xs leading-none tracking-tight md:text-base">
                    <Trans>{option.discount}% off</Trans>
                  </span>
                </div>
              ) : (
                <div className="w-10" />
              )}

              <div className="flex items-baseline gap-1 md:gap-1.5">
                <span className="font-medium font-mono text-ens-blue-dark text-xl leading-none tracking-tighter md:text-3xl">
                  ${formattedTotalPrice}
                </span>
                <span className="font-normal text-ens-gray-three text-xs leading-none tracking-tight md:text-base">
                  <Trans>total</Trans>
                </span>
              </div>
            </div>
          </button>
        )
      })}

      {/* Custom Duration Row */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: clicking focuses the input, keyboard users can tab directly to it */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: clicking focuses the input, keyboard users can tab directly to it */}
      <div
        className={cn(
          'group relative',
          'flex h-[58px] w-full items-center justify-between md:h-[100px]',
          'px-3 py-4 md:px-5 md:py-8',
          'rounded-lg border md:rounded-xl',
          'bg-ens-white transition-all',
          'cursor-pointer hover:border-ens-blue',
          isCustomSelected || isCustomFocused
            ? 'border-ens-blue'
            : 'border-ens-gray-three',
          disabled &&
            'cursor-not-allowed opacity-60 hover:border-ens-gray-three',
        )}
        onClick={() => customInputRef.current?.focus()}
      >
        {/* Left: Label */}
        <div className="flex items-center gap-3 md:gap-5">
          <span className="whitespace-nowrap font-normal text-ens-blue-dark text-sm leading-none tracking-tighter md:text-2xl">
            <Trans>Enter custom duration</Trans>
          </span>
        </div>

        {/* Right: Input + years in unified container */}
        <div
          className={cn(
            'flex items-center gap-1.5 rounded border bg-white px-2 py-1.5 md:gap-2 md:px-3 md:py-2.5',
            isCustomSelected || isCustomFocused
              ? 'border-ens-blue'
              : 'border-ens-gray-three',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <input
            aria-label={t`Custom duration in years`}
            className={cn(
              'w-10 md:w-12',
              'border-none bg-transparent outline-none',
              'font-medium font-mono text-ens-blue-dark text-sm leading-none tracking-tighter md:text-xl',
              'text-right',
              'disabled:cursor-not-allowed',
              '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            )}
            disabled={disabled}
            max={1000}
            min={MIN_REGISTER_DURATION_YEARS}
            onBlur={handleCustomInputBlur}
            onChange={handleCustomInputChange}
            onFocus={handleCustomInputFocus}
            ref={customInputRef}
            step={1}
            type="number"
            value={
              isCustomFocused
                ? customDisplayValue
                : isCustomSelected
                  ? durationInputValue
                  : ''
            }
          />
          <span className="font-normal text-ens-gray-three text-xs leading-none tracking-tight md:text-base">
            <Trans>years</Trans>
          </span>
        </div>
      </div>
    </div>
  )
}
