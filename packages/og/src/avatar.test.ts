import { describe, expect, it } from 'vitest'
import {
  isOgAvatarContentType,
  isOgAvatarDataUri,
  ogAvatarMediaType,
} from './avatar'

describe('ogAvatarMediaType', () => {
  it.each([
    ['image/png', 'image/png'],
    ['image/jpeg', 'image/jpeg'],
    ['image/webp', 'image/webp'],
    ['image/png; charset=binary', 'image/png'],
    ['IMAGE/PNG', 'image/png'],
    ['image/svg+xml', null],
    ['image/svg+xml; charset=utf-8', null],
    ['image/SVG+XML', null],
    ['image/svg', null],
    ['image/x-icon', null],
    ['image/png,data:image/svg+xml', null],
    ['text/html', null],
    ['', null],
    [null, null],
  ])('%s → %s', (header, expected) => {
    expect(ogAvatarMediaType(header)).toBe(expected)
  })
})

describe('isOgAvatarContentType', () => {
  it.each([
    ['image/png', true],
    ['image/png; charset=binary', false],
    ['IMAGE/PNG', false],
    ['image/svg+xml', false],
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
    ['data:IMAGE/PNG;base64,AQIDBA==', false],
    ['data:image/png,AQIDBA==', false],
    ['data:image/png;charset=binary;base64,AQIDBA==', false],
    ['data:IMAGE/PNG,x,data:image/svg+xml,<svg></svg>', false],
    ['data:image/png;base64,AQ==data:image/svg+xml,<svg></svg>', false],
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
