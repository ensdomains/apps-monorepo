import { describe, expect, it } from 'vitest'
import {
  insertNormalizedNameSearchPaste,
  normalizePastedNameSearch,
} from './normalizePastedNameSearch'

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

  it('keeps a zero-width joiner that joins two emoji', () => {
    for (const name of ['👨‍💻.eth', '🏳️‍🌈.eth', '👩🏽‍💻.eth', '🏴‍☠️.eth']) {
      expect(normalizePastedNameSearch(name)).toBe(name)
    }
  })

  it('strips a zero-width joiner that does not join two emoji', () => {
    expect(normalizePastedNameSearch('hello\u200Dworld')).toBe('helloworld')
    expect(normalizePastedNameSearch('\u200Dabc\u200D')).toBe('abc')
    expect(normalizePastedNameSearch('👍\u200Dabc')).toBe('👍abc')
  })
})

describe('insertNormalizedNameSearchPaste', () => {
  it('inserts at the caret without replacing the rest of the input', () => {
    expect(
      insertNormalizedNameSearchPaste('hello.eth', ' World', 5, 5),
    ).toEqual({
      value: 'helloworld.eth',
      caret: 10,
    })
  })

  it('replaces only the selected range', () => {
    expect(
      insertNormalizedNameSearchPaste('foo.eth', 'Hello World', 0, 3),
    ).toEqual({
      value: 'helloworld.eth',
      caret: 10,
    })
  })
})
