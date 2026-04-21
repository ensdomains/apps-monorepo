import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { getEnsContractName } from './ensContractNames'

const MAINNET = 1
const SEPOLIA = 11155111
const UNKNOWN_CHAIN = 99999

describe('getEnsContractName', () => {
  it('returns undefined for an unknown chain ID', () => {
    expect(
      getEnsContractName(
        UNKNOWN_CHAIN,
        '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85' as Address,
      ),
    ).toBeUndefined()
  })

  it('returns undefined for an unrecognised address on a known chain', () => {
    expect(
      getEnsContractName(
        MAINNET,
        '0x0000000000000000000000000000000000001234' as Address,
      ),
    ).toBeUndefined()
  })

  it('returns the display name for a mainnet contract (exact case)', () => {
    // ensBaseRegistrarImplementation on mainnet
    expect(
      getEnsContractName(
        MAINNET,
        '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85' as Address,
      ),
    ).toBe('BaseRegistrar')
  })

  it('is case-insensitive for the address', () => {
    expect(
      getEnsContractName(
        MAINNET,
        '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85' as Address,
      ),
    ).toBe('BaseRegistrar')
    expect(
      getEnsContractName(
        MAINNET,
        '0x57F1887A8BF19B14FC0DF6FD9B2ACC9AF147EA85' as Address,
      ),
    ).toBe('BaseRegistrar')
  })

  it('returns correct labels for several mainnet contracts', () => {
    const cases: [Address, string][] = [
      ['0xa12159e5131b1eEf6B4857EEE3e1954744b5033A', 'BulkRenewal'],
      ['0xB32cB5677a7C971689228EC835800432B339bA2B', 'DNSRegistrar'],
      ['0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5', 'DNSSECImpl'],
      ['0x253553366Da8546fC250F225fe3d25d0C782303b', 'ETHRegistrarController'],
      ['0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401', 'NameWrapper'],
      ['0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63', 'PublicResolver'],
    ]
    for (const [address, expected] of cases) {
      expect(getEnsContractName(MAINNET, address)).toBe(expected)
    }
  })

  it('returns correct labels for sepolia contracts', () => {
    const cases: [Address, string][] = [
      ['0x6409609247722761b8ba96371485de92a6d7b83b', 'BaseRegistrar'],
      ['0x7f86d816165baf4fd68bfd9a0706601cdd666ac4', 'BulkRenewal'],
      ['0x99e517db3db5ec5424367b8b50cd11ddcb0008f1', 'ETHRegistrarController'],
      ['0xc7e033b8836e4bd55d069d113f018b98478cb091', 'NameWrapper'],
      ['0x796fff2e907449be8d5921bcc215b1b76d89d080', 'ENSRegistry'],
      ['0x4dc74fef4fc6b5a810a1554d431f06c8d8b7451c', 'UniversalResolver'],
    ]
    for (const [address, expected] of cases) {
      expect(getEnsContractName(SEPOLIA, address)).toBe(expected)
    }
  })

  it('does not return names for zeroAddress entries', () => {
    // zeroAddress is excluded when building the lookup
    expect(
      getEnsContractName(
        MAINNET,
        '0x0000000000000000000000000000000000000000' as Address,
      ),
    ).toBeUndefined()
  })
})
