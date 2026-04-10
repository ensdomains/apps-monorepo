import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  // getDurationFromPickerDate,
  // getStartOfToday,
  // getYearsFromDuration,
  isDateWithinCalendarRange,
} from '@/features/register/utils/registrationDuration'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import { dateToPlainDate, plainDateToDate } from '@/utils/temporal'

// import { RegistrationDurationPresets } from '@/features/register/components/RegistrationDurationPresets'

type RegistrationExpiryDatePickerProps = {
  readonly date: Temporal.PlainDate
  readonly onDateChange: (date: Temporal.PlainDate) => void
  readonly minDate: Temporal.PlainDate
  readonly maxDate: Temporal.PlainDate
}

export const RegistrationExpiryDatePicker = ({
  date,
  onDateChange,
  minDate,
  maxDate,
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

  // const handlePresetSelect = (spanValue: number) => {
  //   const startOfToday = getStartOfToday()
  //   const expiryDate = startOfToday.add({ years: spanValue })
  //   const cappedDate =
  //     Temporal.PlainDate.compare(expiryDate, maxDate) > 0 ? maxDate : expiryDate
  //   onDateChange(cappedDate)
  // }

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
      {/* Discounts disabled on contracts - uncomment once re-enabled */}
      {/* <RegistrationDurationPresets
        value={Math.round(
          getYearsFromDuration(getDurationFromPickerDate(date)),
        )}
        onSelect={handlePresetSelect}
      /> */}
    </div>
  )
}
