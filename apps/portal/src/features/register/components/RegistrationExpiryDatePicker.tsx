import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { RegistrationDurationPresets } from '@/features/register/components/RegistrationDurationPresets'
import {
  getDurationFromPickerDate,
  getYearsFromDuration,
  isDateWithinCalendarRange,
} from '@/features/register/utils/registrationDuration'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import { dateToPlainDate, plainDateToDate } from '@/utils/temporal'

type RegistrationExpiryDatePickerProps = {
  readonly date: Temporal.PlainDate
  readonly onDateChange: (date: Temporal.PlainDate) => void
  readonly onYearsPresetSelect: (years: number) => void
  readonly minDate: Temporal.PlainDate
  readonly maxDate: Temporal.PlainDate
  readonly name?: string
}

export const RegistrationExpiryDatePicker = ({
  date,
  onDateChange,
  onYearsPresetSelect,
  minDate,
  maxDate,
  name,
}: RegistrationExpiryDatePickerProps) => {
  const [isOpen, setIsOpen] = useState(false)

  const displayValue = formatDateTime(date)

  const selectedDateForCalendar = plainDateToDate(date)
  const minDateForCalendar = plainDateToDate(minDate)
  const maxDateForCalendar = plainDateToDate(maxDate)

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      onDateChange(dateToPlainDate(d))
      setIsOpen(false)
    }
  }

  const handlePresetSelect = (spanValue: number) => {
    onYearsPresetSelect(spanValue)
  }

  const disabled = (date: Date) => {
    return !isDateWithinCalendarRange(dateToPlainDate(date), minDate, maxDate)
  }

  return (
    <div className="space-y-5">
      <Popover onOpenChange={setIsOpen} open={isOpen}>
        <PopoverTrigger asChild>
          <button
            id="registration-expiry-date"
            type="button"
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 text-left text-foreground outline-none transition-[color,box-shadow] hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-2',
            )}
          >
            <span className="flex-1 truncate text-2xl font-medium">
              {displayValue}
            </span>
            <span className="flex rounded-md size-8 shrink-0 items-center justify-center bg-secondary">
              <CalendarIcon className="size-3 text-primary" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 border border-border"
          align="start"
        >
          <Calendar
            captionLayout="dropdown"
            defaultMonth={selectedDateForCalendar}
            disabled={disabled}
            endMonth={maxDateForCalendar}
            formatters={{
              formatMonthDropdown: (d) =>
                d.toLocaleString('default', { month: 'long' }),
              formatYearDropdown: (d) => d.getFullYear().toString(),
            }}
            mode="single"
            onSelect={handleSelect}
            required
            selected={selectedDateForCalendar}
            startMonth={minDateForCalendar}
          />
        </PopoverContent>
      </Popover>
      {name ? (
        <RegistrationDurationPresets
          value={Math.round(
            getYearsFromDuration(getDurationFromPickerDate(date)),
          )}
          onSelect={handlePresetSelect}
          name={name}
        />
      ) : null}
    </div>
  )
}
