import { describe, expect, it } from 'vitest'
import { getNewRecordKey } from './newRecordKey'

const base = { coinType: 2147492101, name: 'Base', notation: 'base' }

describe('getNewRecordKey', () => {
  it.each([
    { type: '', key: 'avatar', coin: base, expected: undefined },
    { type: 'text', key: '', coin: base, expected: undefined },
    {
      type: 'text',
      key: 'avatar',
      coin: undefined,
      expected: { type: 'text', key: 'avatar' },
    },
    // A typed text key is never read as a coin.
    { type: 'address', key: 'base', coin: undefined, expected: undefined },
    {
      type: 'address',
      key: '',
      coin: base,
      expected: { type: 'address', coin: base },
    },
    { type: 'abi', key: '', coin: undefined, expected: { type: 'abi' } },
  ] as const)(
    '$type with key "$key" stages $expected',
    ({ type, key, coin, expected }) => {
      expect(getNewRecordKey(type, key, coin)).toEqual(expected)
    },
  )
})
