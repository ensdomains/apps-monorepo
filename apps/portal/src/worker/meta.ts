import { escapeHtml } from '@ens-apps/og/markup'

export interface MetaTagOptions {
  title: string
  description: string
  imageUrl: string
  type?: 'website' | 'profile'
  imageAlt?: string | null
}

/**
 * Cap for any attacker-controlled value interpolated into the meta block.
 *
 * Escaping expands a value up to sixfold (`"` becomes `&quot;`), and every
 * value lands in both an `og:` and a `twitter:` tag, so an uncapped record was
 * held in memory at twelve times its own size before the response streamed —
 * enough for a single name to abort the isolate (Immunefi #92466). OG readers
 * truncate around 200 characters anyway.
 */
export const META_VALUE_MAX_CHARS = 300

const escapeMetaValue = (value: string): string =>
  escapeHtml(value.slice(0, META_VALUE_MAX_CHARS))

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
  const escapedImageUrl = escapeMetaValue(imageUrl)

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
