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
  instantToTimeValue,
  mergeTimeIntoInstant,
} from '@/features/register/utils/dateTimeInput'
import { formatPriceForInput } from '@/features/register/utils/formatPriceForInput'
import {
  getInstantForPremiumPrice,
  getPremiumPriceAtInstant,
  PREMIUM_PERIOD_MS,
} from '@/features/register/utils/premiumDecay'
import { isDateWithinCalendarRange } from '@/features/register/utils/registrationDuration'
import { cn } from '@/lib/utils'
import { formatExpiryDateTimeLocal } from '@/utils/formatting/formatDateTime'
import { instantToDate } from '@/utils/temporal'

function useSyncPremiumCalculatorOnOpen(
  open: boolean,
  premiumStart: Temporal.Instant | null,
  setSelectedPrice: (price: number) => void,
  setSelectedInstant: (instant: Temporal.Instant) => void,
  setPriceInput: (value: string) => void,
) {
  useEffect(() => {
    if (open && premiumStart) {
      const now = Temporal.Now.instant()
      const price = getPremiumPriceAtInstant(premiumStart, now)
      setSelectedPrice(price)
      setSelectedInstant(now)
      setPriceInput(formatPriceForInput(price))
    }
  }, [open, premiumStart, setSelectedPrice, setSelectedInstant, setPriceInput])
}

type TemporaryPremiumDrawerProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly currentPremium: string
  readonly premiumStart: Temporal.Instant | null
}

/**
 * Drawer explaining the temporary premium for recently expired names,
 * with an interactive calculator to convert between price and date.
 */
export const TemporaryPremiumDrawer = ({
  open,
  onOpenChange,
  currentPremium,
  premiumStart,
}: TemporaryPremiumDrawerProps) => {
  const premiumEnd = premiumStart
    ? Temporal.Instant.fromEpochMilliseconds(
        premiumStart.epochMilliseconds + PREMIUM_PERIOD_MS,
      )
    : null

  const currentCalculatedPrice = premiumStart
    ? getPremiumPriceAtInstant(premiumStart, Temporal.Now.instant())
    : 0

  const [selectedPrice, setSelectedPrice] = useState(0)
  const [selectedInstant, setSelectedInstant] = useState<Temporal.Instant>(() =>
    Temporal.Now.instant(),
  )
  const [priceInput, setPriceInput] = useState('')
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  useSyncPremiumCalculatorOnOpen(
    open,
    premiumStart,
    setSelectedPrice,
    setSelectedInstant,
    setPriceInput,
  )

  function applyDateSelection(newInstant: Temporal.Instant) {
    if (!premiumStart || !premiumEnd) return

    const nowMs = Temporal.Now.instant().epochMilliseconds
    const clampedMs = Math.max(
      nowMs,
      Math.min(newInstant.epochMilliseconds, premiumEnd.epochMilliseconds),
    )
    const clamped = Temporal.Instant.fromEpochMilliseconds(clampedMs)

    const price = getPremiumPriceAtInstant(premiumStart, clamped)
    setSelectedPrice(price)
    setSelectedInstant(clamped)
    setPriceInput(formatPriceForInput(price))
  }

  function handlePriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.]/g, '')
    setPriceInput(raw)

    if (!premiumStart) return

    let parsed = Number.parseFloat(raw)
    if (Number.isNaN(parsed) || parsed < 0) parsed = 0
    if (parsed > currentCalculatedPrice) parsed = currentCalculatedPrice

    const instant = getInstantForPremiumPrice(premiumStart, parsed)
    setSelectedPrice(parsed)
    setSelectedInstant(instant)
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
    // Use the selected calendar date from the picker, but keep the current time-of-day
    const baseInstant = Temporal.Instant.fromEpochMilliseconds(d.valueOf())
    const merged = mergeTimeIntoInstant(
      baseInstant,
      instantToTimeValue(selectedInstant),
    )
    applyDateSelection(merged)
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const merged = mergeTimeIntoInstant(selectedInstant, e.target.value)
    applyDateSelection(merged)
  }

  // react-day-picker disabled callback receives native Date objects
  function isDateDisabled(d: Date) {
    if (!premiumEnd) return true
    return !isDateWithinCalendarRange(
      d,
      instantToDate(Temporal.Now.instant()),
      instantToDate(premiumEnd),
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
                {premiumEnd ? formatExpiryDateTimeLocal(premiumEnd) : 'N/A'}
              </p>
            </div>
          </div>

          {premiumStart && premiumEnd && (
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
                          {formatExpiryDateTimeLocal(selectedInstant)}
                        </span>
                        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 border border-border"
                      align="start"
                    >
                      <Calendar
                        defaultMonth={instantToDate(selectedInstant)}
                        disabled={isDateDisabled}
                        endMonth={instantToDate(premiumEnd)}
                        mode="single"
                        onSelect={handleCalendarSelect}
                        selected={instantToDate(selectedInstant)}
                        startMonth={instantToDate(Temporal.Now.instant())}
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
                          value={instantToTimeValue(selectedInstant)}
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
