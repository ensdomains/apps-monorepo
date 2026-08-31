import { describe, expect, it } from 'vitest'
import { getCustomRegistryAddressError } from './SubregistryConfigurator'

const CHECKSUMMED = '0x801D2e48d378F161Dba7AD7ad002Ad557714c191'

describe('getCustomRegistryAddressError', () => {
  it('accepts a checksummed address, and either all-lower or all-upper case', () => {
    expect(getCustomRegistryAddressError(CHECKSUMMED)).toBeNull()
    expect(getCustomRegistryAddressError(CHECKSUMMED.toLowerCase())).toBeNull()
  })

  it('says nothing about an empty field', () => {
    expect(getCustomRegistryAddressError('')).toBeNull()
  })

  it('calls out a checksum mismatch as a typo, not a bad address', () => {
    // Same address with the last character changed: well formed, wrong checksum.
    expect(
      getCustomRegistryAddressError(
        '0x801D2e48d378F161Dba7AD7ad002Ad557714c194',
      ),
    ).toMatch(/checksum/)
  })

  it('rejects anything that is not an address at all', () => {
    for (const value of ['0x801D2e48', 'not-an-address', `${CHECKSUMMED}00`]) {
      expect(getCustomRegistryAddressError(value)).toBe(
        'Enter a valid contract address.',
      )
    }
  })
})
