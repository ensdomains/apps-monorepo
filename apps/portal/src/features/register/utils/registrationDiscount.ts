/**
 * Formats a discount percent for display.
 *
 * Returns "12.5%" for non-integer percents, "20%" for integers,
 * and "0%" for non-positive values.
 */
export function formatDiscountPercentForDisplay(percent: number): string {
  if (percent <= 0) return '0%'
  const formatted =
    percent % 1 === 0 ? String(percent) : percent.toFixed(1).replace(/\.0$/, '')
  return `${formatted}%`
}
