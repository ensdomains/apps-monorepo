import { escapeHtml } from '@ens-apps/og/markup'
import { sanitizeOnChainText } from '@/utils/formatting/sanitizeOnChainText'

export interface MetaTagOptions {
  readonly title: string
  readonly description: string
  readonly imageUrl: string
  readonly type?: 'website' | 'profile'
  readonly imageAlt?: string | null
}

/**
 * Cap for the display text interpolated into the meta block.
 *
 * Escaping expands a value up to sixfold (`"` becomes `&quot;`), and every
 * value lands in both an `og:` and a `twitter:` tag, so an uncapped record was
 * held in memory at twelve times its own size before the response streamed —
 * enough for a single name to abort the isolate (Immunefi #92466). OG readers
 * truncate around 200 characters anyway.
 */
export const META_VALUE_MAX_CHARS = 300

/**
 * Bound a value before the code-point pass.
 *
 * `sanitizeOnChainText` spreads the string into an array of code points, which
 * for a multi-megabyte record is the very allocation this cap exists to
 * prevent. Cutting in UTF-16 units first keeps that array small — generously,
 * since a code point takes at most two units — and a high surrogate left
 * dangling at the cut is dropped so the sanitizer never sees half a pair.
 */
const boundedSlice = (value: string, maxCodePoints: number): string => {
  if (value.length <= maxCodePoints) return value

  const sliced = value.slice(0, maxCodePoints * 2)
  const lastUnit = sliced.charCodeAt(sliced.length - 1)
  const endsOnHighSurrogate = lastUnit >= 0xd800 && lastUnit <= 0xdbff

  return endsOnHighSurrogate ? sliced.slice(0, -1) : sliced
}

/**
 * Cap a display value at {@link META_VALUE_MAX_CHARS} code points.
 *
 * Truncating by code point rather than UTF-16 unit keeps an emoji or other
 * astral character at the boundary from being split into a lone surrogate, and
 * `sanitizeOnChainText` also strips the control and bidi characters an
 * attacker-authored record can otherwise smuggle into the markup.
 */
export const capMetaText = (
  value: string,
  maxCodePoints: number = META_VALUE_MAX_CHARS,
): string =>
  sanitizeOnChainText(boundedSlice(value, maxCodePoints), maxCodePoints)

const escapeMetaValue = (value: string): string =>
  escapeHtml(capMetaText(value))

/** Build the shared OG / Twitter meta tag block. */
export function buildMetaTags({
  title,
  description,
  imageUrl,
  type = 'website',
  imageAlt = null,
}: MetaTagOptions): string {
  // Escaped once and reused: each value is emitted twice, and escaping the
  // same string twice doubled the peak memory for no benefit.
  const escapedTitle = escapeMetaValue(title)
  const escapedDescription = escapeMetaValue(description)
  // Not capped: this URL is built by the worker from the name in the request
  // path, so its length is already bounded, and truncating it would cut the
  // `.png` (or a percent-encoded sequence) off a long name's card and break
  // every preview for it.
  const escapedImageUrl = escapeHtml(imageUrl)

  return [
    `<meta property="og:title" content="${escapedTitle}" />`,
    `<meta property="og:description" content="${escapedDescription}" />`,
    `<meta property="og:image" content="${escapedImageUrl}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapedTitle}" />`,
    `<meta name="twitter:description" content="${escapedDescription}" />`,
    `<meta name="twitter:image" content="${escapedImageUrl}" />`,
    imageAlt
      ? `<meta property="og:image:alt" content="${escapeMetaValue(imageAlt)}" />`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}
