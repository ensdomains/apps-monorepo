import { type ClassValue, clsx } from 'clsx'
import type { MaterialSymbol } from './material-symbol-url'

export { MATERIAL_SYMBOLS_URL } from './material-symbol-url'

/**
 * Material Symbol component for rendering Google Material Symbols icons.
 *
 * This component renders Material Symbols icons with support for Tailwind utility classes
 * to control weight, fill, grade, and optical size. All utilities support Tailwind modifiers
 * like hover, focus, breakpoints, etc.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <MSymbol symbol="notifications" />
 *
 * // With weight utility
 * <MSymbol symbol="drafts" className="ms-wght-600" />
 *
 * // With hover modifier
 * <MSymbol symbol="notifications" className="ms-wght-400 hover:ms-wght-700" />
 *
 * // With fill and responsive sizing
 * <MSymbol
 *   symbol="drafts"
 *   className="ms-fill ms-opsz-24 md:ms-opsz-40 hover:ms-wght-600"
 * />
 *
 * // With grade for emphasis
 * <MSymbol
 *   symbol="notifications"
 *   className="ms-grade-emphasis ms-wght-500"
 * />
 *
 * // Combining multiple utilities
 * <MSymbol
 *   symbol="drafts"
 *   className="ms-wght-300 ms-opsz-20 hover:ms-wght-600 hover:ms-fill focus:ms-grade-emphasis"
 * />
 * ```
 *
 * @param props - Component props
 * @param props.symbol - The Material Symbol icon name (must be one of the symbols in MATERIAL_SYMBOLS)
 * @param props.className - Optional className string or ClassValue for Tailwind utilities
 *
 * @see {@link https://fonts.google.com/icons Material Symbols} for available icon names
 */
export const MSymbol = ({
  symbol,
  className,
  ...props
}: MaterialSymbolProps) => {
  return createElement(
    'span',
    { className: clsx('material-symbol', className), ...props },
    symbol,
  )
}
