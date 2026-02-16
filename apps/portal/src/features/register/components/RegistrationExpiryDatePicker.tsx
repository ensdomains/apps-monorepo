import { CalendarIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
  const displayValue = formatDateLong(date) ?? 'Select date'

  return (
    <Label
      htmlFor={'registration-expiry-date'}
      className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] hover:bg-accent/50"
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            id={'registration-expiry-date'}
            type="button"
            className="flex flex-1 items-center justify-between gap-2 text-left outline-none"
          >
            <span className="flex-1 truncate">{displayValue}</span>
            <span className="shrink-0 text-muted-foreground">
              <CalendarIcon className="size-4" />
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
