import { addMonths } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatDateLong } from '@/utils/formatting/formatDateRange'

type RegistrationExpiryDatePickerProps = {
  date: Date
  onDateChange: (date: Date) => void
  minDate?: Date
}

export const RegistrationExpiryDatePicker = ({
  date,
  onDateChange,
  minDate,
}: RegistrationExpiryDatePickerProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const displayValue = formatDateLong(date)

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      onDateChange(d)
      setIsOpen(false)
    }
  }

  const disabled = minDate
    ? (d: Date) => {
        const today = new Date(minDate)
        today.setHours(0, 0, 0, 0)
        const dateToCheck = new Date(d)
        dateToCheck.setHours(0, 0, 0, 0)
        return dateToCheck.getTime() < today.getTime()
      }
    : undefined

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <button
          id="registration-expiry-date"
          type="button"
          className={cn(
            'flex h-13 w-full cursor-pointer items-center gap-2 rounded-md border p-3 text-left text-foreground outline-none transition-[color,box-shadow] hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-2',
          )}
        >
          <span className="flex-1 truncate text-2xl font-medium">
            {displayValue}
          </span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-gray-200">
            <CalendarIcon className="size-3" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border border-border rounded-md"
        align="start"
      >
        <Calendar
          captionLayout="dropdown"
          defaultMonth={date}
          disabled={disabled}
          endMonth={addMonths(new Date(), 1200)}
          formatters={{
            formatMonthDropdown: (d) =>
              d.toLocaleString('default', { month: 'long' }),
            formatYearDropdown: (d) => d.getFullYear().toString(),
          }}
          mode="single"
          onSelect={handleSelect}
          required
          selected={date}
          startMonth={new Date()}
        />
      </PopoverContent>
    </Popover>
  )
}
