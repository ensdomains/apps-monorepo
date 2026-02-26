import { addMonths } from 'date-fns'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const MAX_DURATION_YEARS = 100

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

  const handleDurationInputChange = (value: string) => {
    const numericValue = value.replace(/\D/g, '')
    if (numericValue === '') {
      onInputChange('')
      return
    }

    const parsed = parseInt(numericValue, 10)
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= MAX_DURATION_YEARS) {
      onInputChange(numericValue)
      onChange(parsed)
    }
  }

  const handleDurationInputBlur = () => {
    const numericValue = parseInt(durationInputValue, 10)
    if (Number.isNaN(numericValue) || numericValue < 1) {
      onChange(1)
    } else if (numericValue > MAX_DURATION_YEARS) {
      onChange(MAX_DURATION_YEARS)
    } else {
      onChange(numericValue)
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
              Registering for
            </span>
            <input
              className="w-10 bg-transparent text-center font-medium text-ens-blue text-xl leading-none tracking-tight outline-none [appearance:textfield] md:text-2xl [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              max={MAX_DURATION_YEARS}
              min="1"
              onBlur={handleDurationInputBlur}
              onChange={(e) => handleDurationInputChange(e.target.value)}
              onKeyDown={handleDurationInputKeyDown}
              type="number"
              value={durationInputValue}
            />
            <span className="font-normal text-ens-blue-midnight text-xl leading-none tracking-tight md:text-2xl">
              years
            </span>
          </div>

          <div className="space-y-2">
            <span className="mr-1 font-normal text-ens-blue-midnight text-xl leading-none tracking-[-0.2px] md:text-2xl md:tracking-[-0.24px]">
              expiring on
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
              <PopoverContent align="center" className="w-auto p-0">
                <Calendar
                  captionLayout="dropdown"
                  defaultMonth={expirationDate}
                  disabled={(date) => {
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const dateToCheck = new Date(date)
                    dateToCheck.setHours(0, 0, 0, 0)
                    return dateToCheck.getTime() < today.getTime()
                  }}
                  endMonth={addMonths(new Date(), 1200)}
                  onSelect={handleDateSelect}
                  selected={expirationDate}
                  showClearButton
                  showTodayButton
                  startMonth={new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  )
}
