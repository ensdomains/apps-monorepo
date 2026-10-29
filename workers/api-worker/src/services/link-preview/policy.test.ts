import { describe, expect, it } from 'vitest'
import {
  getPreviewCacheControl,
  getSourceExpiry,
  normalizePreviewUrl,
  selectPreviewImage,
} from './policy'

describe('link preview cache policy', () => {
  it.each([
    ['public, max-age=120', '30', 90_000],
    ['max-age=3600, s-maxage=600', null, 600_000],
    ['max-age=999999', null, 86_400_000],
    ['public, no-cache', null, 0],
    ['private="set-cookie"', null, 0],
    ['no-store', null, 0],
    ['max-age=60', '90', 0],
  ])('respects upstream %s with Age %s', (cacheControl, age, lifetime) => {
    expect(getSourceExpiry({ cacheControl, age, now: 1_000_000 })).toBe(
      1_000_000 + lifetime,
    )
  })

  it('does not extend browser freshness near expiry or serve expired entries stale', () => {
    expect(getPreviewCacheControl(1_030_000, 1_000_000)).toBe(
      'public, max-age=30, s-maxage=30, must-revalidate',
    )
    expect(getPreviewCacheControl(1_030_000, 1_030_000)).toBe('no-store')
  })
})

describe('link preview URL policy', () => {
  it('shares cache entries across fragments while preserving the full path and query', () => {
    expect(
      normalizePreviewUrl(
        'https://EXAMPLE.com:443/blog?a=1&b=2#section',
      ).unwrapOr(undefined),
    ).toBe('https://example.com/blog?a=1&b=2')
  })

  it('ignores invalid base URLs and preserves image query parameters', () => {
    expect(
      selectPreviewImage({
        pageUrl: 'https://example.com/blog/post',
        metadata: {
          bases: ['javascript:bad'],
          images: [
            {
              property: 'og:image',
              content: '../og.png?width=1200&height=630',
            },
          ],
        },
      }),
    ).toBe('https://example.com/og.png?width=1200&height=630')
  })
})
