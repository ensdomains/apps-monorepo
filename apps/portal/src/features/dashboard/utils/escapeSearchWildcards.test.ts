import { describe, expect, it } from 'vitest'
import { escapeSearchWildcards } from './escapeSearchWildcards'

describe('escapeSearchWildcards', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeSearchWildcards('coco77.eth')).toBe('coco77.eth')
  })

  it('escapes the characters a LIKE pattern treats as wildcards', () => {
    expect(escapeSearchWildcards('_dns')).toBe('\\_dns')
    expect(escapeSearchWildcards('100%')).toBe('100\\%')
  })

  it('escapes a backslash, so it cannot escape what follows', () => {
    expect(escapeSearchWildcards('a\\_b')).toBe('a\\\\\\_b')
  })
})
