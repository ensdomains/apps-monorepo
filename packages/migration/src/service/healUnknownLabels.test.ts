import { describe, expect, it } from 'vitest'
import { lookupRecord } from './_fixtures'
import { healUnknownLabels } from './healUnknownLabels'

const HASHED =
  '[ac0fdfc7eec4a82d6493c6dabe0e07d60eac9af7a3d1a54e431d79d4d9e2520a].quiet-raven.eth'

describe('healUnknownLabels', () => {
  it('fills an encoded labelhash with the requested label that hashes to it', () => {
    expect(
      healUnknownLabels(lookupRecord(HASHED), 'anotherwallet.quiet-raven.eth')
        .name,
    ).toBe('anotherwallet.quiet-raven.eth')
  })

  it.each([
    ['a label with another hash', HASHED, 'other.quiet-raven.eth'],
    ['a different depth', HASHED, 'a.b.quiet-raven.eth'],
    ['the hash itself', HASHED, HASHED],
    ['a known label', 'red.quiet-raven.eth', 'red.quiet-raven.eth'],
  ])('leaves the record alone for %s', (_, stored, requested) => {
    expect(healUnknownLabels(lookupRecord(stored), requested).name).toBe(stored)
  })
})
