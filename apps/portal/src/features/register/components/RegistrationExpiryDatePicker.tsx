import { CalendarIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
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
  id?: string
}

export const RegistrationExpiryDatePicker = ({
  date,
  onDateChange,
  minDate,
}: RegistrationExpiryDatePickerProps) => {
  const displayValue = formatDateLong(date)

  return (
    <Label
      htmlFor={'registration-expiry-date'}
      className={cn(
        'flex h-13 cursor-pointer items-center gap-2 rounded-md border',
        'w-full p-3 text-foreground',
      )}
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            id={'registration-expiry-date'}
            type="button"
            className="flex flex-1 items-center justify-between gap-2 text-left outline-none"
          >
            <span className="flex-1 truncate text-2xl font-medium">
              {displayValue}
            </span>
            <span className="shrink-0 bg-gray-200 rounded-sm p-1 h-9 w-9 flex items-center justify-center">
              <CalendarIcon className="size-3" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            required
            selected={date}
            onSelect={(d) => d && onDateChange(d)}
            defaultMonth={date}
            disabled={minDate ? (d) => d < minDate : undefined}
          />
        </PopoverContent>
      </Popover>
    </Label>
  )
}
