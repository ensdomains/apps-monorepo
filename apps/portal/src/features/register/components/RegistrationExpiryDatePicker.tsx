import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import { isDateWithinCalendarRange } from '../utils/registrationDuration'

type RegistrationExpiryDatePickerProps = {
  readonly date: Date
  readonly onDateChange: (date: Date) => void
  readonly minDate: Date
  readonly maxDate: Date
}

export const RegistrationExpiryDatePicker = ({
  date,
  onDateChange,
  minDate,
  maxDate,
}: RegistrationExpiryDatePickerProps) => {
  const [isOpen, setIsOpen] = useState(false)

  const displayValue = formatDateTime(date)

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      onDateChange(d)
      setIsOpen(false)
    }
  }

  const disabled = (d: Date) => {
    return !isDateWithinCalendarRange(d, minDate, maxDate)
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
            defaultMonth={date}
            disabled={disabled}
            endMonth={maxDate}
            formatters={{
              formatMonthDropdown: (d) =>
                d.toLocaleString('default', { month: 'long' }),
              formatYearDropdown: (d) => d.getFullYear().toString(),
            }}
            mode="single"
            onSelect={handleSelect}
            required
            selected={date}
            startMonth={minDate}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
