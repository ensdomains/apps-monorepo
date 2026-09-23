import { describe, expect, it } from 'vitest'
import { getReverseNameAddress } from './reverseNameAddress'

const address = '0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5'
const label = address.slice(2).toLowerCase()

describe('getReverseNameAddress', () => {
  it.each([
    'addr',
    'default',
    '80000002',
  ])('links a %s reverse record to its wallet address', (namespace) => {
    expect(getReverseNameAddress(`${label}.${namespace}.reverse`)).toBe(address)
  })

  it.each([
    'alice.eth',
    `${label}.eth`,
    `${label}.invalid.reverse`,
    '1234.addr.reverse',
    `${label}.addr.reverse.extra`,
  ])('ignores non-EVM reverse records and ordinary names', (name) => {
    expect(getReverseNameAddress(name)).toBeNull()
  })
})
