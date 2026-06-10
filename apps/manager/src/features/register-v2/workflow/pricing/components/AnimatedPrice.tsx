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

// Built once at module load and reused. Constructing Intl.NumberFormat per
// render is wasteful, and this re-renders every second as the premium decays.
const WHOLE_USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const CENTS_USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Pricing-page money formatting (per design): whole dollars by default; cents
 * only when the value drops below $1 (i.e. the tail of the cooldown).
 */
export const formatPricingUsd = (value: number): string =>
  (value > 0 && value < 1 ? CENTS_USD : WHOLE_USD).format(value)

type AnimatedPriceProps = {
  value: number
  emphasis?: 'soft' | 'active'
}

export const AnimatedPrice = ({
  value,
  emphasis = 'soft',
}: AnimatedPriceProps) => (
  <Calligraph animation={ANIMATION_BY_EMPHASIS[emphasis]} variant="number">
    {formatPricingUsd(value)}
  </Calligraph>
)
