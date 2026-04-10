/**
 * Formats a number as a display price string for input fields.
 * Example: 7680717.2 → "7,680,717.20"
 */

export function formatPriceForInput(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
