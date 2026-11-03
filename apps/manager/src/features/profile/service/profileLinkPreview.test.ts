import { describe, expect, it } from 'vitest'
import { getProfileLinkPreviewUrl } from './profileLinkPreview'

describe('getProfileLinkPreviewUrl', () => {
  it.each([
    ['https://api.ens.domains', 'https://api.ens.domains/link-preview/image'],
    ['https://preview.ens.dev/', 'https://preview.ens.dev/link-preview/image'],
    ['/api', '/api/link-preview/image'],
  ])('uses the configured backend base %s', (apiBaseUrl, endpoint) => {
    const href = 'https://example.com/article?theme=dark&lang=en#title'
    expect(getProfileLinkPreviewUrl({ apiBaseUrl, href })).toBe(
      `${endpoint}?url=${encodeURIComponent(href)}`,
    )
  })
})
