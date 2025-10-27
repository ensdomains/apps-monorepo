import { format } from 'date-fns'
import { ChevronDown, XIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type DateRange = {
  from?: Date
  to?: Date
}

export const TableDateRangeFilter = ({
  label,
  dateRange,
  onChange,
  variant = 'outline',
}: {
  label: string
  dateRange: DateRange
  onChange: (range: DateRange) => void
  variant?: 'default' | 'outline'
}) => {
  const [open, setOpen] = useState(false)
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)

  const handleReset = () => {
    onChange({ from: undefined, to: undefined })
    setOpen(false)
  }

  const formatDate = (date?: Date) => {
    if (!date) return undefined
    return format(date, 'yyyy/MM/dd')
  }

  const getDisplayLabel = () => {
    if (dateRange.from && dateRange.to) {
      return `${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}`
    }
    if (dateRange.from) {
      return `From ${formatDate(dateRange.from)}`
    }
    if (dateRange.to) {
      return `Until ${formatDate(dateRange.to)}`
    }
    return 'All'
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} className="flex items-center gap-2">
          {label}: {getDisplayLabel()}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Filter by date</h3>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <XIcon className="h-4 w-4 font-bold" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="date-from">From</Label>
              <Popover open={fromOpen} onOpenChange={setFromOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    {dateRange.from
                      ? formatDate(dateRange.from)
                      : 'Select date'}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto overflow-hidden p-0"
                  align="start"
                >
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    captionLayout="dropdown"
                    onSelect={(date: Date | undefined) => {
                      onChange({ ...dateRange, from: date })
                      setFromOpen(false)
                    }}
                    disabled={(date: Date) =>
                      dateRange.to ? date > dateRange.to : false
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="date-to">To</Label>
              <Popover open={toOpen} onOpenChange={setToOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    {dateRange.to ? formatDate(dateRange.to) : 'Today'}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto overflow-hidden p-0"
                  align="start"
                >
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    captionLayout="dropdown"
                    onSelect={(date: Date | undefined) => {
                      onChange({ ...dateRange, to: date })
                      setToOpen(false)
                    }}
                    disabled={(date: Date) =>
                      dateRange.from ? date < dateRange.from : false
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="mt-4 pt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="flex-1"
            >
              Reset
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
