import { describe, expect, it } from 'vitest'
import { getNewRecordConflict, getNewRecordKey } from './newRecordKey'

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

describe('getNewRecordConflict', () => {
  const savedBtc = { type: 'address', key: 'BTC', value: 'bc1', id: 0 } as const
  const bitcoin = { coinType: 0, name: 'Bitcoin', notation: 'btc' }

  it('explains a picked coin whose exact coin type already has a row under another name', () => {
    expect(
      getNewRecordConflict([savedBtc], { type: 'address', coin: bitcoin }),
    ).toBe('Coin type 0 already has a row. Edit that row instead.')
    expect(
      getNewRecordConflict([savedBtc], { type: 'address', coin: base }),
    ).toBeUndefined()
  })

  it.each([
    { newKey: { type: 'text', key: 'avatar' }, isTaken: true },
    { newKey: { type: 'abi' }, isTaken: true },
    { newKey: { type: 'contentHash' }, isTaken: false },
  ] as const)('$newKey conflicts: $isTaken', ({ newKey, isTaken }) => {
    const rows = [
      { type: 'text', key: 'avatar', value: 'ipfs://a' },
      { type: 'abi', value: '[]', _uid: 'x', isNew: true },
    ] as const
    expect(getNewRecordConflict(rows, newKey) !== undefined).toBe(isTaken)
  })
})
