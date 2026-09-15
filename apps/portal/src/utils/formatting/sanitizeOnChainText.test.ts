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

  it('should strip bidi overrides and isolates', () => {
    const rtlOverride = String.fromCodePoint(0x202e)
    const popDirectional = String.fromCodePoint(0x202c)
    const isolate = String.fromCodePoint(0x2066)
    const popIsolate = String.fromCodePoint(0x2069)
    expect(sanitizeOnChainText(`${rtlOverride}evil${popDirectional}`)).toBe(
      'evil',
    )
    expect(sanitizeOnChainText(`a${isolate}b${popIsolate}c`)).toBe('a b c')
  })

  it('should strip zero-width characters and the BOM', () => {
    const zeroWidthSpace = String.fromCodePoint(0x200b)
    const bom = String.fromCodePoint(0xfeff)
    expect(sanitizeOnChainText(`a${zeroWidthSpace}b${bom}c`)).toBe('a b c')
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
