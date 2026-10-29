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
    expect(
      getSourceExpiry({
        cacheControl,
        age,
        expires: null,
        date: null,
        now: 1_000_000,
      }),
    ).toBe(1_000_000 + lifetime)
  })

  it.each([
    {
      name: 'an already-expired response',
      headers: {
        date: 'Thu, 01 Jan 1970 00:14:00 GMT',
        expires: 'Thu, 01 Jan 1970 00:15:00 GMT',
      },
      lifetime: 0,
    },
    {
      name: 'elapsed time since Date without double-counting Age',
      headers: {
        date: 'Thu, 01 Jan 1970 00:16:00 GMT',
        expires: 'Thu, 01 Jan 1970 00:17:00 GMT',
        age: '40',
      },
      lifetime: 20_000,
    },
    {
      name: 'Age exceeding the apparent response age',
      headers: {
        date: 'Thu, 01 Jan 1970 00:16:00 GMT',
        expires: 'Thu, 01 Jan 1970 00:18:00 GMT',
        age: '90',
      },
      lifetime: 30_000,
    },
    {
      name: 'an Expires deadline without Date',
      headers: { expires: 'Thu, 01 Jan 1970 00:17:00 GMT' },
      lifetime: 20_000,
    },
    {
      name: 'an invalid Expires deadline',
      headers: { expires: 'invalid' },
      lifetime: 0,
    },
    {
      name: 'max-age taking precedence over Expires',
      headers: {
        cacheControl: 'max-age=120',
        age: '30',
        expires: 'Thu, 01 Jan 1970 00:15:00 GMT',
      },
      lifetime: 90_000,
    },
  ])('respects $name', ({ headers, lifetime }) => {
    expect(
      getSourceExpiry({
        cacheControl: null,
        age: null,
        date: null,
        now: 1_000_000,
        ...headers,
      }),
    ).toBe(1_000_000 + lifetime)
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
