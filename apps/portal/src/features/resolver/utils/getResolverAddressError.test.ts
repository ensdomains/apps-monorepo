import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { getResolverAddressError } from './getResolverAddressError'

const LOWERCASE = '0xabcdef123456789012345678901234567890abcd'
const CHECKSUMMED = getAddress(LOWERCASE)

const run = (value: string, isTouched = false) =>
  getResolverAddressError({ value, isTouched })

describe('getResolverAddressError', () => {
  it.each([
    ['empty', ''],
    ['an all-lowercase address', LOWERCASE],
    ['a checksummed address', CHECKSUMMED],
  ])('accepts %s even once touched', (_, value) => {
    expect(run(value, true)).toBeNull()
  })

  it('flags a checksum mismatch', () => {
    // Same characters, mixed case that doesn't match the checksum.
    const badChecksum = `${LOWERCASE.slice(0, -4)}ABCD`
    expect(run(badChecksum)).toBe(
      "This address's checksum doesn't match. Check it for a typo.",
    )
  })

  it('flags a value without the 0x prefix straight away', () => {
    expect(run('e'.repeat(50))).toBe('A contract address starts with 0x.')
  })

  it('holds back "starts with 0x" for a lone 0 until the field is touched', () => {
    expect(run('0')).toBeNull()
    expect(run('0', true)).toBe('A contract address starts with 0x.')
  })

  it('flags characters that are not hex straight away', () => {
    expect(run('0x12g4')).toBe(
      'A contract address only contains the characters 0-9 and a-f after 0x.',
    )
  })

  it('flags a value that is too long straight away', () => {
    expect(run(`${LOWERCASE}1`)).toBe(
      'A contract address is 42 characters long, including 0x. This one is 43.',
    )
  })

  it('holds back "too short" until the field is touched', () => {
    const short = '0x1111111111111111111111111111111111111'
    expect(run(short)).toBeNull()
    expect(run(short, true)).toBe(
      'A contract address is 42 characters long, including 0x. This one is 39.',
    )
  })

  it('treats a bare 0x as too short once touched', () => {
    expect(run('0x', true)).toBe(
      'A contract address is 42 characters long, including 0x. This one is 2.',
    )
  })
})
