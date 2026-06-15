import { Trans } from '@lingui/react/macro'
import { addDays, addMonths } from 'date-fns'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  formatYears,
  MIN_REGISTER_DURATION_SECONDS,
  MIN_REGISTER_DURATION_YEARS,
  SECONDS_PER_DAY,
} from '@/features/register/components/Pricing/utils'
import { cn } from '@/lib/utils'

const MAX_DURATION_YEARS = 100
const MIN_DURATION_DAYS = MIN_REGISTER_DURATION_SECONDS / SECONDS_PER_DAY

type PricingRegistrationSummaryCardProps = {
  paddedDuration: string
  formattedExpiration: string
  expirationDate: Date
  onChange: (input: Date | number | undefined) => void
  durationInputValue: string
  onInputChange: (value: string) => void
}

export const PricingRegistrationSummaryCard = ({
  paddedDuration,
  formattedExpiration,
  expirationDate,
  onChange,
  durationInputValue,
  onInputChange,
}: PricingRegistrationSummaryCardProps) => {
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false)
  const minSelectableDate = addDays(new Date(), MIN_DURATION_DAYS)

  const handleDurationInputChange = (value: string) => {
    const normalized = value.replace(',', '.')
    if (normalized === '') {
      onInputChange('')
      return
    }

    if (!/^\d*\.?\d*$/.test(normalized)) return

    const parsed = parseFloat(normalized)
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= MAX_DURATION_YEARS) {
      onInputChange(normalized)
      if (parsed > 0) {
        onChange(Math.max(MIN_REGISTER_DURATION_YEARS, parsed))
      }
    }
  }

  const handleDurationInputBlur = () => {
    const numericValue = parseFloat(durationInputValue)
    if (Number.isNaN(numericValue) || numericValue <= 0) {
      onInputChange(formatYears(MIN_REGISTER_DURATION_YEARS))
      onChange(MIN_REGISTER_DURATION_YEARS)
    } else if (numericValue > MAX_DURATION_YEARS) {
      onInputChange(formatYears(MAX_DURATION_YEARS))
      onChange(MAX_DURATION_YEARS)
    } else {
      const clampedValue = Math.max(MIN_REGISTER_DURATION_YEARS, numericValue)
      onInputChange(formatYears(clampedValue))
      onChange(clampedValue)
    }
  }

  const handleDurationInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      onInputChange(paddedDuration)
      e.currentTarget.blur()
    }
  }

  const handleDateSelect = (date: Date | undefined) => {
    onChange(date)
    if (date) {
      setIsDatePopoverOpen(false)
    }
  }

  return (
    <div className="flex h-[25%] flex-col items-center justify-center rounded-2xl border border-ens-gray-two bg-white px-6 py-6 shadow-sm">
      <div className="w-full space-y-6">
        <div className="space-y-2 text-center">
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="font-normal text-ens-blue-midnight text-xl leading-none tracking-tight md:text-2xl">
              <Trans>Registering for</Trans>
            </span>
            <input
              className="w-16 bg-transparent text-center font-medium text-ens-blue text-xl leading-none tracking-tight outline-none [appearance:textfield] md:text-2xl [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              max={MAX_DURATION_YEARS}
              min={MIN_REGISTER_DURATION_YEARS}
              onBlur={handleDurationInputBlur}
              onChange={(e) => handleDurationInputChange(e.target.value)}
              onKeyDown={handleDurationInputKeyDown}
              step={1}
              type="number"
              value={durationInputValue}
            />
            <span className="font-normal text-ens-blue-midnight text-xl leading-none tracking-tight md:text-2xl">
              <Trans>years</Trans>
            </span>
          </div>

          <div className="space-y-2">
            <span className="mr-1 font-normal text-ens-blue-midnight text-xl leading-none tracking-[-0.2px] md:text-2xl md:tracking-[-0.24px]">
              <Trans>expiring on</Trans>
            </span>
            <Popover
              onOpenChange={setIsDatePopoverOpen}
              open={isDatePopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-2 rounded-sm border-ens-gray-two border-b bg-[rgb(250,250,250)] px-3 py-1.5 transition-all hover:border-ens-blue',
                  )}
                  type="button"
                >
                  <span className="font-medium text-ens-blue text-xl leading-none tracking-tight md:text-2xl">
                    {formattedExpiration}
                  </span>
                  <Pencil className="size-4 text-ens-blue" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="center"
                className="w-auto rounded-2xl bg-white p-0"
              >
                <Calendar
                  captionLayout="dropdown"
                  defaultMonth={expirationDate}
                  disabled={(date) => {
                    const minDate = new Date(minSelectableDate)
                    minDate.setHours(0, 0, 0, 0)
                    const dateToCheck = new Date(date)
                    dateToCheck.setHours(0, 0, 0, 0)
                    return dateToCheck.getTime() < minDate.getTime()
                  }}
                  endMonth={addMonths(new Date(), 1200)}
                  minimumDate={minSelectableDate}
                  onSelect={handleDateSelect}
                  selected={expirationDate}
                  showClearButton
                  showMinimumButton
                  startMonth={minSelectableDate}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  )
}
