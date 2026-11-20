import { describe, expect, it } from 'vitest'
import { isOgAvatarContentType, isOgAvatarDataUri } from './avatar'

describe('isOgAvatarContentType', () => {
  it.each([
    ['image/png', true],
    ['image/jpeg', true],
    ['image/webp', true],
    ['image/png; charset=binary', true],
    ['IMAGE/PNG', true],
    ['image/svg+xml', false],
    ['image/svg+xml; charset=utf-8', false],
    ['image/SVG+XML', false],
    ['image/svg', false],
    ['text/html', false],
    ['', false],
  ])('%s → %s', (contentType, expected) => {
    expect(isOgAvatarContentType(contentType)).toBe(expected)
  })
})

describe('isOgAvatarDataUri', () => {
  it.each([
    ['data:image/png;base64,AQIDBA==', true],
    ['data:image/gif;base64,R0lGOD==', true],
    ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', false],
    ['data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E', false],
    ['data:image/svg+xml,<svg></svg>', false],
    ['data:image/Svg+Xml;base64,PHN2Zz48L3N2Zz4=', false],
    ['data:text/html;base64,PHNjcmlwdD4=', false],
    ['https://cdn.example/a.png', false],
  ])('%s → %s', (uri, expected) => {
    expect(isOgAvatarDataUri(uri, 64)).toBe(expected)
  })

  it.each([
    [8, true],
    [9, false],
  ])(
    'caps the payload, not the header, at 8 chars: %i chars → %s',
    (chars, expected) => {
      expect(
        isOgAvatarDataUri(`data:image/png;base64,${'A'.repeat(chars)}`, 8),
      ).toBe(expected)
    },
  )
})
