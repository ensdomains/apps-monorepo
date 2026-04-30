type RangeOrValue = `${number}..${number}` | `${number}`

const OPTICAL_SIZE: RangeOrValue = '20..48'
const WEIGHT: RangeOrValue = '100..700'
const FILL: RangeOrValue = '0..1'
const GRADE: RangeOrValue = '-50..200'

/**
 * List of Material Symbols icons to load.
 *
 * @see {@link https://fonts.google.com/icons Material Symbols} for available icon names
 */
export const MATERIAL_SYMBOLS = [
  'drafts',
  'notifications',
  'waving_hand',
  'settings',
  'search',
  'sentiment_calm',
  'schedule',
  'favorite',
  'mail',
  'check',
  'priority_high',
  'more_horiz',
  'delete',
  'badge',
  'cached',
  'close',
  'warning',
  'edit',
  'arrow_back',
  'calendar_month',
  'double_arrow',
] as const satisfies readonly string[]

export type MaterialSymbol = (typeof MATERIAL_SYMBOLS)[number]

// Google Fonts requires the icons to be sorted alphabetically
const MATERIAL_SYMBOLS_SORTED = (MATERIAL_SYMBOLS as unknown as string[]).sort(
  (a, b) => a.localeCompare(b),
) as readonly MaterialSymbol[]

/**
 * Google Fonts URL for Material Symbols with variable font settings.
 * This URL is configured to load only the symbols defined in MATERIAL_SYMBOLS
 * to optimize font loading performance.
 *
 * Lives in a JSX-free module so it can be imported from non-React contexts
 * (e.g. `.storybook/main.ts`) without esbuild trying to parse JSX.
 */
export const MATERIAL_SYMBOLS_URL = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@${OPTICAL_SIZE},${WEIGHT},${FILL},${GRADE}&icon_names=${MATERIAL_SYMBOLS_SORTED.join(',')}&display=block`
