import { describe, expect, it } from 'vitest'
import { sanitizeOnChainText } from './sanitizeOnChainText'

describe('sanitizeOnChainText', () => {
  it('should leave ordinary record keys untouched', () => {
    expect(sanitizeOnChainText('com.twitter')).toBe('com.twitter')
    expect(sanitizeOnChainText('avatar')).toBe('avatar')
  })

  it('should keep non-latin scripts', () => {
    expect(sanitizeOnChainText('عنوان')).toBe('عنوان')
    expect(sanitizeOnChainText('日本語')).toBe('日本語')
  })

  it('should strip newlines and tabs, collapsing the whitespace', () => {
    expect(sanitizeOnChainText('ENS is\n\n\tmigrating')).toBe(
      'ENS is migrating',
    )
  })

  it('should strip bidi overrides, isolates and zero-width characters', () => {
    // literals would be invisible in this file, so build them from code points
    const cp = String.fromCodePoint
    expect(sanitizeOnChainText(`${cp(0x202e)}evil${cp(0x202c)}`)).toBe('evil')
    expect(sanitizeOnChainText(`a${cp(0x2066)}b${cp(0x2069)}c`)).toBe('a b c')
    expect(sanitizeOnChainText(`a${cp(0x200b)}b${cp(0xfeff)}c`)).toBe('a b c')
  })

  it('should strip line and paragraph separators', () => {
    expect(sanitizeOnChainText(`a${String.fromCodePoint(0x2028)}b`)).toBe('a b')
  })

  it('should cap the length and mark the truncation', () => {
    expect(sanitizeOnChainText('a'.repeat(500))).toBe(`${'a'.repeat(64)}…`)
    expect(sanitizeOnChainText('abcdef', 3)).toBe('abc…')
  })

  it('should truncate by code point, never splitting a surrogate pair', () => {
    expect(sanitizeOnChainText('😀😀😀', 2)).toBe('😀😀…')
  })

  it('should return an empty string when nothing printable survives', () => {
    expect(
      sanitizeOnChainText(
        `${String.fromCodePoint(0x202e)}${String.fromCodePoint(0x200b)}\n  `,
      ),
    ).toBe('')
    expect(sanitizeOnChainText('')).toBe('')
  })
})
