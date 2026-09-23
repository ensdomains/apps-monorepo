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
    'imageUrl',
  ] as const)('caps %s at the meta value limit', (field) => {
    const tags = buildMetaTags({
      ...baseOptions,
      [field]: 'a'.repeat(10_000),
    })

    expect(tags).toContain('a'.repeat(META_VALUE_MAX_CHARS))
    expect(tags).not.toContain('a'.repeat(META_VALUE_MAX_CHARS + 1))
  })

  it('caps the image alt text', () => {
    const tags = buildMetaTags({ ...baseOptions, imageAlt: 'a'.repeat(10_000) })

    expect(tags).toContain('a'.repeat(META_VALUE_MAX_CHARS))
    expect(tags).not.toContain('a'.repeat(META_VALUE_MAX_CHARS + 1))
  })
})
