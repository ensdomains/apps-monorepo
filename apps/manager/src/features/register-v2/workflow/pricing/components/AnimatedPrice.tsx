import { Calligraph } from 'calligraph'
import type { ComponentProps } from 'react'

/**
 * Money figure that animates with Calligraph's fluid character transition —
 * shared digits slide to their new positions while entering digits fade in
 * and exiting ones fade out. Deliberately NOT a slot-machine wheel, which
 * reads as "hectic" for the decaying temporary-premium fees.
 */

type Animation = ComponentProps<typeof Calligraph>['animation']

const ANIMATION_BY_EMPHASIS: Record<'soft' | 'active', Animation> = {
  soft: 'smooth',
  active: 'snappy',
}

/**
 * Pricing-page money formatting (per design): whole dollars by default;
 * cents only when the value drops below $1 (i.e. the tail of the cooldown).
 */
export const formatPricingUsd = (
  value: number,
  locales?: Intl.LocalesArgument,
): string => {
  const showCents = value > 0 && value < 1
  return new Intl.NumberFormat(locales, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(value)
}

type AnimatedPriceProps = {
  value: number
  locales?: Intl.LocalesArgument
  emphasis?: 'soft' | 'active'
  /** Override the default whole-dollar formatting with custom `Intl.NumberFormat` options. */
  format?: Intl.NumberFormatOptions
}

export const AnimatedPrice = ({
  value,
  locales,
  emphasis = 'soft',
  format,
}: AnimatedPriceProps) => (
  <Calligraph animation={ANIMATION_BY_EMPHASIS[emphasis]} variant="number">
    {format
      ? new Intl.NumberFormat(locales, format).format(value)
      : formatPricingUsd(value, locales)}
  </Calligraph>
)
