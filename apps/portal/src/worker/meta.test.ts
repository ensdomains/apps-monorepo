import { describe, expect, it } from 'vitest'
import { buildMetaTags, META_VALUE_MAX_CHARS } from './meta'

const baseOptions = {
  title: 'alice.eth — ENS Explorer App',
  description: 'A description',
  imageUrl: 'https://explorer.ens.dev/og/alice.eth.png',
}

describe('buildMetaTags', () => {
  it('emits the OG and Twitter tags', () => {
    const tags = buildMetaTags(baseOptions)

    expect(tags).toContain(
      '<meta property="og:description" content="A description" />',
    )
    expect(tags).toContain(
      '<meta name="twitter:description" content="A description" />',
    )
  })

  it('escapes values into both tags', () => {
    const tags = buildMetaTags({ ...baseOptions, description: '"><script>' })

    expect(tags).toContain(
      '<meta property="og:description" content="&quot;&gt;&lt;script&gt;" />',
    )
    expect(tags).toContain(
      '<meta name="twitter:description" content="&quot;&gt;&lt;script&gt;" />',
    )
    expect(tags).not.toContain('<script>')
  })

  // Immunefi #92466: an uncapped `description` of quote characters expanded
  // sixfold per escape and was emitted twice, building a meta block twelve
  // times the record size in memory — enough to abort the isolate.
  it('bounds a 1 MiB description record', () => {
    const description = '"'.repeat(1024 * 1024)

    const tags = buildMetaTags({ ...baseOptions, description })

    // 300 chars of `"` escape to 6 chars each, emitted in two tags.
    const escapedOnce = META_VALUE_MAX_CHARS * '&quot;'.length
    expect(tags.length).toBeLessThan(2 * escapedOnce + 1024)
    expect(tags).not.toContain('"'.repeat(META_VALUE_MAX_CHARS + 1))
  })

  it.each([
    'title',
    'description',
  ] as const)('caps %s at the meta value limit', (field) => {
    const tags = buildMetaTags({
      ...baseOptions,
      [field]: 'a'.repeat(10_000),
    })

    expect(tags).toContain('a'.repeat(META_VALUE_MAX_CHARS))
    expect(tags).not.toContain('a'.repeat(META_VALUE_MAX_CHARS + 1))
  })

  // The image URL is built by the worker from the name in the request path, so
  // it's already bounded — and truncating it would cut off the `.png` (or a
  // percent-encoded sequence) and break the card for every long name.
  it('leaves a long generated image URL intact', () => {
    const imageUrl = `https://explorer.ens.dev/og/${'a'.repeat(400)}.png`

    const tags = buildMetaTags({ ...baseOptions, imageUrl })

    expect(tags).toContain(`<meta property="og:image" content="${imageUrl}" />`)
    expect(tags).toContain(
      `<meta name="twitter:image" content="${imageUrl}" />`,
    )
  })

  // Truncating by UTF-16 unit would split an emoji into a lone surrogate.
  it('truncates on a code point boundary', () => {
    const description = '😀'.repeat(400)

    const tags = buildMetaTags({ ...baseOptions, description })

    const content = tags.match(
      /<meta property="og:description" content="([^"]*)" \/>/,
    )?.[1]
    expect(content).toBeDefined()
    expect(
      [...(content ?? '')].every((char) => char === '😀' || char === '…'),
    ).toBe(true)
    expect(content).not.toMatch(/[\uD800-\uDFFF]/u)
  })

  it('caps the image alt text', () => {
    const tags = buildMetaTags({ ...baseOptions, imageAlt: 'a'.repeat(10_000) })

    expect(tags).toContain('a'.repeat(META_VALUE_MAX_CHARS))
    expect(tags).not.toContain('a'.repeat(META_VALUE_MAX_CHARS + 1))
  })
})
