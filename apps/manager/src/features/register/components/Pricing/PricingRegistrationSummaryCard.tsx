import { addMonths } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import * as React from 'react'
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
}

export const PricingRegistrationSummaryCard = ({
  paddedDuration,
  formattedExpiration,
  expirationDate,
  onChange,
}: PricingRegistrationSummaryCardProps) => {
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false)
  const [durationInput, setDurationInput] = useState(paddedDuration)

  React.useEffect(() => {
    setDurationInput(paddedDuration)
  }, [paddedDuration])

  const handleDurationInputChange = (value: string) => {
    const numericValue = value.replace(/\D/g, '')
    if (numericValue === '') {
      setDurationInput('')
      return
    }
    setDurationInput(numericValue)
  }

  const handleDurationInputBlur = () => {
    const numericValue = parseInt(durationInput, 10)
    if (Number.isNaN(numericValue) || numericValue < 1) {
      const clampedValue = 1
      setDurationInput(clampedValue.toString().padStart(2, '0'))
      onChange(clampedValue)
    } else if (numericValue > MAX_DURATION_YEARS) {
      const clampedValue = MAX_DURATION_YEARS
      setDurationInput(clampedValue.toString().padStart(2, '0'))
      onChange(clampedValue)
    } else {
      const paddedValue = numericValue.toString().padStart(2, '0')
      setDurationInput(paddedValue)
      onChange(numericValue)
    }
  }

  const handleDurationInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setDurationInput(paddedDuration)
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
            <div className="rounded-sm bg-ens-gray-two px-1 py-0.5">
              <input
                className="w-10 bg-transparent text-center font-medium text-ens-blue text-xl leading-none tracking-tight outline-none [appearance:textfield] md:text-2xl [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                max={MAX_DURATION_YEARS}
                min="1"
                onBlur={handleDurationInputBlur}
                onChange={(e) => handleDurationInputChange(e.target.value)}
                onKeyDown={handleDurationInputKeyDown}
                type="number"
                value={durationInput}
              />
            </div>
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
                    'relative inline-flex cursor-pointer items-center gap-2 rounded-sm bg-ens-gray-two px-1 py-0.5 shadow-sm transition-shadow hover:shadow-lg',
                  )}
                  type="button"
                >
                  <div className="relative z-10 flex items-center gap-2">
                    <CalendarIcon className="size-4 text-ens-blue" />
                    <span className="font-medium text-ens-blue text-xl leading-none tracking-tight md:text-2xl">
                      {formattedExpiration}
                    </span>
                  </div>
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
