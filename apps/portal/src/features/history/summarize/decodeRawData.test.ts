import { describe, expect, it } from 'vitest'
import { resolveDecodedName } from './decodeRawData'

describe('resolveDecodedName', () => {
  it('returns dotted values as full names', () => {
    expect(resolveDecodedName('troy.eth')).toBe('troy.eth')
    expect(resolveDecodedName('alice.parent.eth', 'parent.eth')).toBe(
      'alice.parent.eth',
    )
  })

  it('returns eventName when value is its leading label', () => {
    expect(resolveDecodedName('troy', 'troy.eth')).toBe('troy.eth')
    expect(resolveDecodedName('alice', 'alice.parent.eth')).toBe(
      'alice.parent.eth',
    )
  })

  it('appends a bare label under the event domain', () => {
    expect(resolveDecodedName('alice', 'parent.eth')).toBe('alice.parent.eth')
  })

  it('returns undefined without a usable value or event name', () => {
    expect(resolveDecodedName('')).toBeUndefined()
    expect(resolveDecodedName('troy')).toBeUndefined()
    expect(resolveDecodedName('troy', null)).toBeUndefined()
  })

  it('does not invent a name from a non-leading label already in eventName', () => {
    expect(resolveDecodedName('parent', 'alice.parent.eth')).toBeUndefined()
    expect(resolveDecodedName('eth', 'troy.eth')).toBeUndefined()
  })
})
