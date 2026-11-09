import { describe, expect, it } from 'vitest'
import { getRouteEntity } from './routeContext'

describe('getRouteEntity', () => {
  it('takes the matched name without substituting or normalizing its identity', () => {
    expect(getRouteEntity([{}, { name: 'ALICE.eth' }, {}])).toEqual({
      type: 'name',
      name: 'ALICE.eth',
    })
  })

  it.each(['addr', 'address'])(
    'recognizes an address from the %s route parameter',
    (key) => {
      const address = '0x0000000000000000000000000000000000000001'
      expect(getRouteEntity([{}, { [key]: address }])).toEqual({
        type: 'address',
        address,
      })
    },
  )

  it('does not infer an entity from unrelated or malformed route parameters', () => {
    expect(
      getRouteEntity([{ tld: 'eth' }, { address: 'not-an-address' }]),
    ).toBeUndefined()
  })
})
