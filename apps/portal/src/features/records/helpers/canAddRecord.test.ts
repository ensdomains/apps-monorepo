import { describe, expect, it } from 'vitest'
import { canAddRecord } from './canAddRecord'

const ETH_ADDRESS = '0x1234567890123456789012345678901234567890'
const BTC_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

describe('canAddRecord', () => {
  it.each([
    ['', ETH_ADDRESS],
    ['   ', ETH_ADDRESS],
    ['UNKNOWN', ''],
    ['UNKNOWN', ETH_ADDRESS],
    ['constructor', ETH_ADDRESS],
    ['ETH', ''],
    ['ETH', '   '],
    ['ETH', 'not-an-address'],
    ['ETH', BTC_ADDRESS],
    ['BTC', ETH_ADDRESS],
  ])('refuses an address row with coin %j and value %j', (key, value) => {
    expect(canAddRecord('address', key, value)).toBe(false)
  })

  it.each([
    ['ETH', ETH_ADDRESS],
    ['btc', BTC_ADDRESS],
    ['DEFAULT', ETH_ADDRESS],
  ])('allows a valid %s address row', (key, value) => {
    expect(canAddRecord('address', key, value)).toBe(true)
  })

  it.each([
    ['', 'description'],
    ['description', ''],
    ['   ', 'description'],
    ['description', '   '],
  ])('refuses a text row with key %j and value %j', (key, value) => {
    expect(canAddRecord('text', key, value)).toBe(false)
  })

  it('allows a text row when both key and value are present', () => {
    expect(canAddRecord('text', 'description', 'Hello')).toBe(true)
  })

  it('requires a selected record type', () => {
    expect(canAddRecord('', 'ETH', ETH_ADDRESS)).toBe(false)
  })

  it.each(['abi', 'contentHash'] as const)(
    'preserves the existing empty-input policy for %s',
    (type) => {
      expect(canAddRecord(type, '', '')).toBe(true)
    },
  )
})
