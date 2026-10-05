import { describe, expect, it } from 'vitest'
import { getOgCardSubject } from './cardSubject'

describe('getOgCardSubject', () => {
  it('draws an address card, checksummed, for an address', () => {
    expect(
      getOgCardSubject('0xcc692d6e11268b40a1e3c58e3d86fc4caab9b77a.png'),
    ).toEqual({
      kind: 'address',
      address: '0xCC692D6E11268B40A1E3C58e3D86Fc4CAAb9b77a',
    })
  })

  it('draws a name card under the canonical spelling', () => {
    expect(getOgCardSubject('Jooooe.ETH.png')).toEqual({
      kind: 'name',
      name: 'jooooe.eth',
    })
  })

  it('draws the invalid card for a dotted name that does not normalise', () => {
    expect(getOgCardSubject('in valid.eth.png')).toEqual({ kind: 'invalid' })
    expect(getOgCardSubject('foo..eth.png')).toEqual({ kind: 'invalid' })
  })

  // WEB-334: a look-alike must never be drawn as a title
  it.each([
    ['Cyrillic letters mixed into a Latin label', 'v\u0456t\u0430lik.eth.png'],
    ['a right-to-left override', 'ev\u202eil.eth.png'],
    ['a zero-width joiner outside an emoji sequence', 'vi\u200dtalik.eth.png'],
  ])('draws the invalid card for %s', (_case, segment) => {
    expect(getOgCardSubject(segment)).toEqual({ kind: 'invalid' })
  })

  it('draws a canonical name card for a spelling that normalises', () => {
    // A soft hyphen normalises away; the card shows the real name, never the
    // look-alike string
    expect(getOgCardSubject('vi\u00adtalik.eth.png')).toEqual({
      kind: 'name',
      name: 'vitalik.eth',
    })
  })

  it('keeps emoji and whole-script names, which are canonical', () => {
    expect(getOgCardSubject('\u{1f680}\u{1f680}\u{1f680}.eth.png')).toEqual({
      kind: 'name',
      name: '\u{1f680}\u{1f680}\u{1f680}.eth',
    })
    expect(getOgCardSubject('\u0455\u0441\u0430\u043c.eth.png')).toEqual({
      kind: 'name',
      name: '\u0455\u0441\u0430\u043c.eth',
    })
  })

  it('falls back to the generic card for anything not name-shaped', () => {
    expect(getOgCardSubject('settings.png')).toEqual({ kind: 'generic' })
    expect(getOgCardSubject('0x1234.png')).toEqual({ kind: 'generic' })
  })
})
