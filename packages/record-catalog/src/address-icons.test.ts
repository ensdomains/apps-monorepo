import { getCoinTypeForReverseRegistrarChainId } from '@ens-apps/l2-primary/v1'
import { describe, expect, it } from 'vitest'
import { getAddressRecordIcon } from './address-icons'

describe('getAddressRecordIcon', () => {
  it.each([
    [2147483704, 'bnb'],
    [2147526762, 'avax'],
    [2148018000, 'scroll'],
    [2147484783, 'lsk'],
    [61, 'etc'],
    [178, 'poa'],
  ])('uses the %i record’s shared %s artwork', (coinType, key) => {
    expect(getAddressRecordIcon(coinType)).toMatch(
      new RegExp(`/${key}-icon\\.svg(?:\\?|$)`),
    )
  })

  it('uses Scroll artwork for the Sepolia reverse registrar’s coin type', () => {
    const mainnet = getCoinTypeForReverseRegistrarChainId(534352, 'mainnet')
    const sepolia = getCoinTypeForReverseRegistrarChainId(534352, 'sepolia')
    expect(getAddressRecordIcon(sepolia)).toBe(getAddressRecordIcon(mainnet))
  })

  it.each([236, 784, 8444])(
    'offers component artwork for coin type %i',
    (coinType) => {
      expect(getAddressRecordIcon(coinType)).toBeTypeOf('function')
    },
  )

  it.each([2147483648, 2147483817, 99999999])(
    'leaves the fallback to the caller for coin type %i',
    (coinType) => {
      expect(getAddressRecordIcon(coinType)).toBeUndefined()
    },
  )
})
