/**
 * Formats the discount percent for display. Use this in both presets and
 * summary so the same value is shown consistently (e.g. "17.5%" not "18%"
 * in one place and "17.5%" in another).
 */
export function formatDiscountPercentForDisplay(percent: number): string {
  if (percent <= 0) return '0%'
  const formatted =
    percent % 1 === 0 ? String(percent) : percent.toFixed(1).replace(/\.0$/, '')
  return `${formatted}%`
}
