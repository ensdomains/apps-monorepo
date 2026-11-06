import { describe, expect, it } from 'vitest'
import { validateAddressRecordValue } from './validateAddress'

const EVM_ADDRESS = '0x1111111111111111111111111111111111111111'

// address-encoder 3.0.0 added these EVM chains (PR 422).
const ADDED_EVM_CHAINS = [
  ['Unichain', 2147483778],
  ['Monad', 2147483791],
  ['Sonic', 2147483794],
  ['World Chain', 2147484128],
  ['HyperEVM', 2147484647],
  ['Lisk', 2147484783],
  ['Soneium', 2147485516],
  ['Ronin', 2147485668],
  ['Abstract', 2147486389],
  ['Tempo', 2147487865],
  ['Robinhood Chain', 2147488311],
  ['Arc', 2147488690],
  ['Plasma', 2147493393],
  ['Arbitrum Nova', 2147525818],
  ['Ink', 2147540721],
  ['Berachain', 2147563742],
  ['Taiko', 2147650648],
] as const

describe('validateAddressRecordValue', () => {
  it.each(ADDED_EVM_CHAINS)(
    'accepts an EVM address for %s and rejects anything else',
    (name, coinType) => {
      expect(validateAddressRecordValue(coinType, EVM_ADDRESS)).toBeUndefined()
      expect(validateAddressRecordValue(coinType, '0x1234')).toBe(
        `Enter a valid ${name} address`,
      )
      expect(validateAddressRecordValue(coinType, 'not-an-address')).toBe(
        `Enter a valid ${name} address`,
      )
    },
  )

  // A saved Binance Chain (714) record must not block an unrelated save.
  it('validates a record for a coin the app library no longer codes', () => {
    expect(
      validateAddressRecordValue(
        714,
        'bnb1grpf0955h0ykzq3ar5nmum7y6gdfl6lxfn46h2',
      ),
    ).toBeUndefined()
    expect(validateAddressRecordValue(714, 'bnb1invalid')).toBe(
      'Enter a valid Binance Chain address',
    )
  })
})
