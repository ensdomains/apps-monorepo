import { CalendarIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  dateToTimeValue,
  mergeTimeIntoDate,
} from '@/features/register/utils/dateTimeInput'
import { formatPriceForInput } from '@/features/register/utils/formatPriceForInput'
import {
  getDateForPremiumPrice,
  getPremiumPriceAtDate,
  PREMIUM_PERIOD_MS,
} from '@/features/register/utils/premiumDecay'
import { cn } from '@/lib/utils'
import { formatExpiryDateTimeLocal } from '@/utils/formatting/formatDateTime'

function useSyncPremiumCalculatorOnOpen(
  open: boolean,
  premiumStartDate: Date | null,
  setSelectedPrice: (price: number) => void,
  setSelectedDate: (date: Date) => void,
  setPriceInput: (value: string) => void,
) {
  useEffect(() => {
    if (open && premiumStartDate) {
      const price = getPremiumPriceAtDate(premiumStartDate, new Date())
      setSelectedPrice(price)
      setSelectedDate(new Date())
      setPriceInput(formatPriceForInput(price))
    }
  }, [open, premiumStartDate, setSelectedPrice, setSelectedDate, setPriceInput])
}

type TemporaryPremiumDrawerProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly currentPremium: string
  readonly premiumStartDate: Date | null
}

/**
 * Drawer explaining the temporary premium for recently expired names,
 * with an interactive calculator to convert between price and date.
 */
export const TemporaryPremiumDrawer = ({
  open,
  onOpenChange,
  currentPremium,
  premiumStartDate,
}: TemporaryPremiumDrawerProps) => {
  const premiumEndDate = premiumStartDate
    ? new Date(premiumStartDate.getTime() + PREMIUM_PERIOD_MS)
    : null

  const currentCalculatedPrice = premiumStartDate
    ? getPremiumPriceAtDate(premiumStartDate, new Date())
    : 0

  const [selectedPrice, setSelectedPrice] = useState(0)
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [priceInput, setPriceInput] = useState('')
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  useSyncPremiumCalculatorOnOpen(
    open,
    premiumStartDate,
    setSelectedPrice,
    setSelectedDate,
    setPriceInput,
  )

  function applyDateSelection(newDate: Date) {
    if (!premiumStartDate || !premiumEndDate) return

    const clamped = new Date(
      Math.max(
        Date.now(),
        Math.min(newDate.getTime(), premiumEndDate.getTime()),
      ),
    )

    const price = getPremiumPriceAtDate(premiumStartDate, clamped)
    setSelectedPrice(price)
    setSelectedDate(clamped)
    setPriceInput(formatPriceForInput(price))
  }

  function handlePriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.]/g, '')
    setPriceInput(raw)

    if (!premiumStartDate) return

    let parsed = Number.parseFloat(raw)
    if (Number.isNaN(parsed) || parsed < 0) parsed = 0
    if (parsed > currentCalculatedPrice) parsed = currentCalculatedPrice

    const date = getDateForPremiumPrice(premiumStartDate, parsed)
    setSelectedPrice(parsed)
    setSelectedDate(date)
  }

  function handlePriceFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.placeholder = selectedPrice.toFixed(2)
    setPriceInput('')
  }

  function handlePriceBlur() {
    setPriceInput(formatPriceForInput(selectedPrice))
  }

  function handlePriceKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  function handleCalendarSelect(d: Date | undefined) {
    if (!d) return
    const merged = mergeTimeIntoDate(d, dateToTimeValue(selectedDate))
    applyDateSelection(merged)
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const merged = mergeTimeIntoDate(selectedDate, e.target.value)
    applyDateSelection(merged)
  }

  function isDateDisabled(d: Date) {
    if (!premiumEndDate) return true
    const dayStart = new Date(d)
    dayStart.setHours(0, 0, 0, 0)
    const nowStart = new Date()
    nowStart.setHours(0, 0, 0, 0)
    const endDay = new Date(premiumEndDate)
    endDay.setHours(23, 59, 59, 999)
    return (
      dayStart.getTime() < nowStart.getTime() ||
      dayStart.getTime() > endDay.getTime()
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="text-3xl font-semibold">
            Temporary premium
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5">
          <p className="text-base leading-relaxed">
            Temporary premiums are a <b>one time</b> cost applied to recently
            expired names to give fair opportunity to new registrations. The
            premium starts at $100,000,000 and reduces to $0 over 21 days, and
            is only applied once on top of the usual registration costs.
          </p>
          <p className="text-base leading-relaxed font-medium">
            The previous owner of this name is exempt from the temporary
            premium.
          </p>

          <div className="grid grid-cols-2 gap-4 grid-row-1">
            <div className="space-y-1">
              <h3 className="text-base font-medium">
                Current temporary premium
              </h3>
              <p className="text-base font-normal">
                {currentPremium}{' '}
                <span className="text-xs font-normal">USD</span>
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-medium">Temporary premium ends</h3>
              <p className="text-base font-normal">
                {premiumEndDate
                  ? formatExpiryDateTimeLocal(premiumEndDate)
                  : 'N/A'}
              </p>
            </div>
          </div>

          {premiumStartDate && premiumEndDate && (
            <div className="space-y-4">
              <h3 className="text-base font-medium">
                Calculate premium at a specific date
              </h3>
              <div className="flex items-center gap-4 border border-border rounded-md p-4">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label
                    className="text-base font-medium"
                    htmlFor="premium-price-input"
                  >
                    Price
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      $
                    </span>
                    <Input
                      id="premium-price-input"
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 1000"
                      value={priceInput}
                      onChange={handlePriceChange}
                      onFocus={handlePriceFocus}
                      onBlur={handlePriceBlur}
                      onKeyDown={handlePriceKeyDown}
                      className="pl-7"
                    />
                  </div>
                </div>
                <span className="self-center">=</span>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label
                    className="text-base font-medium"
                    htmlFor="premium-date-input"
                  >
                    Date
                  </Label>
                  <Popover
                    open={datePickerOpen}
                    onOpenChange={setDatePickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <button
                        id="premium-date-input"
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm outline-none transition-colors',
                          'hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-2',
                        )}
                      >
                        <span className="flex-1 truncate">
                          {formatExpiryDateTimeLocal(selectedDate)}
                        </span>
                        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 border border-border"
                      align="start"
                    >
                      <Calendar
                        defaultMonth={selectedDate}
                        disabled={isDateDisabled}
                        endMonth={premiumEndDate}
                        mode="single"
                        onSelect={handleCalendarSelect}
                        selected={selectedDate}
                        startMonth={new Date()}
                      />
                      <div className="border-t border-border p-3">
                        <Label
                          htmlFor="premium-time-input"
                          className="text-xs text-muted-foreground"
                        >
                          Time
                        </Label>
                        <Input
                          id="premium-time-input"
                          type="time"
                          value={dateToTimeValue(selectedDate)}
                          onChange={handleTimeChange}
                          className="mt-1"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
