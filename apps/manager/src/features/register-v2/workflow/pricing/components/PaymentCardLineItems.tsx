import { Trans } from '@lingui/react/macro'
import { AnimateNumber } from 'motion-plus/react'
import type { ReactNode } from 'react'
import { type MaterialSymbol, MSymbol } from '@/components/ui/material-symbol'
import { tw } from '@/utils/tailwind'

/**
 * Generic line item in the PaymentCard breakdown. Used twice when a name
 * is in temporary premium cooldown:
 *
 *   ⏳ Registration   $1,920
 *   ⏳ Cooldown fee + $39,287,564
 *   ────────────────────────────
 *           TOTAL
 *      $39,289,484.00 USD
 *
 * Without a separate base line the user can't tell which part of the total
 * comes from duration × yearly rate vs. the one-time cooldown — the value
 * on a single "Price + cooldown fee" line was always just the cooldown,
 * leaving the base price invisible.
 */
type PaymentCardLineItemProps = {
  label: ReactNode
  amount: number
  isLoading: boolean
  /** Material symbol icon name. Use `receipt_long` for base, `hourglass` for premium. */
  symbol: MaterialSymbol
  /** Show a `+` prefix in front of the amount (used for the additive cooldown line). */
  showPlus?: boolean
}

const PaymentCardLineItem = ({
  label,
  amount,
  isLoading,
  symbol,
  showPlus = false,
}: PaymentCardLineItemProps) => (
  <div
    className={tw(
      'flex w-full items-center justify-between gap-2 text-sm text-ens-lapis-500',
      isLoading && 'animate-pulse',
    )}
  >
    <div className="flex items-center gap-2">
      <MSymbol className="ms-opsz-16 ms-wght-400" symbol={symbol} />
      <span>{label}</span>
    </div>
    <span className="tabular-nums">
      {showPlus && '+ '}
      <AnimateNumber
        format={{
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }}
      >
        {amount}
      </AnimateNumber>
    </span>
  </div>
)

/**
 * The cooldown (temporary premium) row. Kept as a named export so existing
 * callers don't need to change; it just delegates to `PaymentCardLineItem`.
 */
export const PaymentCardPremiumLine = ({
  premiumAmount,
  isLoading,
}: {
  premiumAmount: number
  isLoading: boolean
}) => (
  <PaymentCardLineItem
    amount={premiumAmount}
    isLoading={isLoading}
    label={<Trans>Cooldown fee</Trans>}
    showPlus
    symbol="hourglass"
  />
)

/**
 * The base registration cost row. Only meaningful when there's also a
 * cooldown — otherwise the TOTAL alone is already the base, and showing it
 * twice would just be noise.
 */
export const PaymentCardBaseLine = ({
  basePrice,
  isLoading,
}: {
  basePrice: number
  isLoading: boolean
}) => (
  <PaymentCardLineItem
    amount={basePrice}
    isLoading={isLoading}
    label={<Trans>Registration</Trans>}
    symbol="receipt_long"
  />
)
