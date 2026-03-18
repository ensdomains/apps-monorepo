import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  getDateForPremiumPrice,
  getPremiumPriceAtDate,
  PREMIUM_PERIOD_MS,
} from '@/features/register/utils/premiumDecay'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

type TemporaryPremiumDrawerProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly currentPremium: string
  readonly premiumStartDate: Date | null
}

/** Format a Date to a datetime-local input value (YYYY-MM-DDTHH:mm). */
function toDateTimeLocalValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

/** Format a number as a display price string (e.g. "7,680,717.20"). */
function formatPriceForInput(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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
  const now = useMemo(() => new Date(), [])

  const premiumEndDate = useMemo(
    () =>
      premiumStartDate
        ? new Date(premiumStartDate.getTime() + PREMIUM_PERIOD_MS)
        : null,
    [premiumStartDate],
  )

  const currentCalculatedPrice = useMemo(
    () => (premiumStartDate ? getPremiumPriceAtDate(premiumStartDate, now) : 0),
    [premiumStartDate, now],
  )

  // Tracks the selected price on the decay curve
  const [selectedPrice, setSelectedPrice] = useState<number>(0)
  const [selectedDate, setSelectedDate] = useState<Date>(now)

  // Raw input values (may differ while user is typing)
  const [priceInput, setPriceInput] = useState('')
  const [dateInput, setDateInput] = useState('')

  const priceInputRef = useRef<HTMLInputElement>(null)

  // Initialize with current premium values when drawer opens
  useEffect(() => {
    if (open && premiumStartDate) {
      setSelectedPrice(currentCalculatedPrice)
      setSelectedDate(now)
      setPriceInput(formatPriceForInput(currentCalculatedPrice))
      setDateInput(toDateTimeLocalValue(now))
    }
  }, [open, premiumStartDate, currentCalculatedPrice, now])

  const handlePriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9.]/g, '')
      setPriceInput(raw)

      if (!premiumStartDate) return

      let parsed = Number.parseFloat(raw)
      if (Number.isNaN(parsed) || parsed < 0) parsed = 0
      if (parsed > currentCalculatedPrice) parsed = currentCalculatedPrice

      const date = getDateForPremiumPrice(premiumStartDate, parsed)
      setSelectedPrice(parsed)
      setSelectedDate(date)
      setDateInput(toDateTimeLocalValue(date))
    },
    [premiumStartDate, currentCalculatedPrice],
  )

  const handlePriceFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.placeholder = selectedPrice.toFixed(2)
      setPriceInput('')
    },
    [selectedPrice],
  )

  const handlePriceBlur = useCallback(() => {
    setPriceInput(formatPriceForInput(selectedPrice))
  }, [selectedPrice])

  const handlePriceKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur()
      }
    },
    [],
  )

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDateInput(e.target.value)

      if (!premiumStartDate || !premiumEndDate) return

      const parsed = new Date(e.target.value)
      if (Number.isNaN(parsed.getTime())) return

      const clamped = new Date(
        Math.max(
          now.getTime(),
          Math.min(parsed.getTime(), premiumEndDate.getTime()),
        ),
      )

      const price = getPremiumPriceAtDate(premiumStartDate, clamped)
      setSelectedPrice(price)
      setSelectedDate(clamped)
      setPriceInput(formatPriceForInput(price))
    },
    [premiumStartDate, premiumEndDate, now],
  )

  const timezoneOffset = useMemo(
    () =>
      now
        .toLocaleString(undefined, { timeZoneName: 'longOffset' })
        .replace(/.* /g, ''),
    [now],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-xl font-semibold">
            Temporary premium
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Temporary premiums are applied to recently expired names to give
            fair opportunity to new registrations. The premium starts high and
            reduces to $0 over 21 days, and is only applied once on top of the
            usual registration costs.
          </p>

          <div className="space-y-2">
            <h3 className="font-medium text-sm">Current temporary premium</h3>
            <p className="font-mono text-lg font-semibold">
              {currentPremium} <span className="text-sm font-normal">USD</span>
            </p>
          </div>

          {premiumStartDate && premiumEndDate && (
            <div className="space-y-4 border-t border-border pt-4">
              <h3 className="font-medium text-sm">Premium calculator</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Enter a target price to see when the premium will drop to that
                amount, or pick a date to see the premium at that time.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="premium-price-input">Target price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    $
                  </span>
                  <Input
                    id="premium-price-input"
                    ref={priceInputRef}
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
                {selectedPrice > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Premium reaches{' '}
                    <span className="font-medium text-foreground">
                      {formatUsd(selectedPrice)}
                    </span>{' '}
                    on{' '}
                    <span className="font-medium text-foreground">
                      {formatExpiryDate(selectedDate)}
                    </span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="premium-date-input">Target date</Label>
                <Input
                  id="premium-date-input"
                  type="datetime-local"
                  value={dateInput}
                  min={toDateTimeLocalValue(now)}
                  max={toDateTimeLocalValue(premiumEndDate)}
                  step={60}
                  onChange={handleDateChange}
                />
                {dateInput && (
                  <p className="text-xs text-muted-foreground">
                    Premium on that date:{' '}
                    <span className="font-medium text-foreground">
                      {formatUsd(selectedPrice)}
                    </span>
                  </p>
                )}
              </div>

              <div className="space-y-1 pt-2">
                <p className="text-xs text-muted-foreground">
                  Premium ends on{' '}
                  <span className="font-medium text-foreground">
                    {formatExpiryDate(premiumEndDate)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Timezone: {timezoneOffset}
                </p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
