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

  it('falls back to the generic card for anything not name-shaped', () => {
    expect(getOgCardSubject('settings.png')).toEqual({ kind: 'generic' })
    expect(getOgCardSubject('0x1234.png')).toEqual({ kind: 'generic' })
  })
})
