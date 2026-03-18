import { useCallback, useMemo, useState } from 'react'
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

  const [priceInput, setPriceInput] = useState('')
  const [dateInput, setDateInput] = useState('')

  const [calculatedDate, setCalculatedDate] = useState<Date | null>(null)
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null)

  const handlePriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9.]/g, '')
      setPriceInput(raw)

      if (!premiumStartDate) return

      const parsed = Number.parseFloat(raw)
      if (Number.isNaN(parsed) || parsed < 0) {
        setCalculatedDate(null)
        return
      }

      const clamped = Math.min(parsed, currentCalculatedPrice)
      const date = getDateForPremiumPrice(premiumStartDate, clamped)
      setCalculatedDate(date)

      setDateInput(toDateTimeLocalValue(date))
      setCalculatedPrice(clamped)
    },
    [premiumStartDate, currentCalculatedPrice],
  )

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDateInput(e.target.value)

      if (!premiumStartDate || !premiumEndDate) return

      const parsed = new Date(e.target.value)
      if (Number.isNaN(parsed.getTime())) {
        setCalculatedPrice(null)
        return
      }

      const clamped = new Date(
        Math.max(
          now.getTime(),
          Math.min(parsed.getTime(), premiumEndDate.getTime()),
        ),
      )

      const price = getPremiumPriceAtDate(premiumStartDate, clamped)
      setCalculatedPrice(price)
      setCalculatedDate(clamped)

      setPriceInput(price > 0 ? price.toFixed(2) : '0')
    },
    [premiumStartDate, premiumEndDate, now],
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
                <Label htmlFor="premium-price-input">Target price (USD)</Label>
                <Input
                  id="premium-price-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 1000"
                  value={priceInput}
                  onChange={handlePriceChange}
                />
                {calculatedDate && priceInput && (
                  <p className="text-xs text-muted-foreground">
                    Premium reaches{' '}
                    <span className="font-medium text-foreground">
                      {formatUsd(calculatedPrice ?? 0)}
                    </span>{' '}
                    on{' '}
                    <span className="font-medium text-foreground">
                      {formatExpiryDate(calculatedDate)}
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
                  onChange={handleDateChange}
                />
                {calculatedPrice !== null && dateInput && (
                  <p className="text-xs text-muted-foreground">
                    Premium on that date:{' '}
                    <span className="font-medium text-foreground">
                      {formatUsd(calculatedPrice)}
                    </span>
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground pt-2">
                Premium ends on{' '}
                <span className="font-medium text-foreground">
                  {formatExpiryDate(premiumEndDate)}
                </span>
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
