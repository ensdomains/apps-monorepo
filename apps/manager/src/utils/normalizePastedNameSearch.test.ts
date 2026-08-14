import { describe, expect, it } from 'vitest'
import { normalizePastedNameSearch } from './normalizePastedNameSearch'

describe('normalizePastedNameSearch', () => {
  it('lowercases and removes spaces from a two-word name', () => {
    expect(normalizePastedNameSearch('Hello World')).toBe('helloworld')
  })

  it('strips surrounding whitespace, newlines, and tabs', () => {
    expect(normalizePastedNameSearch('  Hello\nWorld\t')).toBe('helloworld')
  })

  it('keeps dots so a TLD still works', () => {
    expect(normalizePastedNameSearch('Hello World.eth')).toBe('helloworld.eth')
  })

  it('strips zero-width and non-breaking spaces from web copy', () => {
    expect(normalizePastedNameSearch('Hello\u00A0World\u200B')).toBe(
      'helloworld',
    )
  })

  it('leaves already-normalized input unchanged', () => {
    expect(normalizePastedNameSearch('helloworld.eth')).toBe('helloworld.eth')
  })
})
