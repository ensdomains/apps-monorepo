import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildConfig } from './build-config'
import { ensContractsFor, getSupportedTokens, getTokens } from './contracts'
import { NetworkConfigError } from './errors'
import { ENS_NETWORKS, NETWORKS } from './networks'

/**
 * Every address these maps hand out eventually reaches viem, which rejects a
 * mixed-case address whose EIP-55 checksum does not match. A single wrong-case
 * character is invisible on review and fails neither a typecheck, a lint, nor
 * a `cast call`, so it survives all the way to a user's wallet and fails at
 * submission. That is exactly how a mis-checksummed `ReverseRegistrarAdapter`
 * once shipped.
 */
const expectChecksummed = (label: string, address: string) => {
  expect(
    () => getAddress(address),
    `${label} is not a valid address`,
  ).not.toThrow()
  expect(getAddress(address), `${label} is not EIP-55 checksummed`).toBe(
    address,
  )
}

const SEPOLIA_CHAIN_ID = NETWORKS.sepolia.chainId

describe('ensContractsFor', () => {
  it.each(
    Object.entries(ensContractsFor(SEPOLIA_CHAIN_ID)),
  )('sepolia %s is a checksummed address', (label, contract) => {
    expectChecksummed(label, (contract as { address: string }).address)
  })

  it('refuses a chain with no ENS deployment instead of guessing', () => {
    expect(() => ensContractsFor(1234)).toThrow(NetworkConfigError)
  })
})

describe('token maps', () => {
  it.each(
    Object.entries(getTokens(SEPOLIA_CHAIN_ID)),
  )('TOKENS.%s.address is a checksummed address', (label, token) => {
    expectChecksummed(label, token.address)
  })

  it('offers only the tokens the registrar settles', () => {
    expect(Object.keys(getSupportedTokens(SEPOLIA_CHAIN_ID))).toEqual(['USDC'])
  })

  it.each(ENS_NETWORKS)('%s tokens are checksummed', (network) => {
    for (const [label, token] of Object.entries(
      getTokens(NETWORKS[network].chainId),
    )) {
      expectChecksummed(`${network}.${label}`, token.address)
    }
  })
})

describe('undeployed contracts', () => {
  // ensjs holds an undeployed contract as the zero address rather than
  // omitting it, so a lookup succeeds and the call goes to 0x0. The build
  // guard is what turns that into a failure, and it must cover the reverse
  // set too now that ensjs carries those keys.
  it('fails a mainnet build naming every zero-address contract', () => {
    expect(() =>
      buildConfig({
        network: 'mainnet',
        overrides: { indexerGraphql: 'https://indexer.example/' },
      }),
    ).toThrow(/ensDefaultReverseRegistrar/)
  })

  it('does not fail sepolia, where they are deployed', () => {
    const sepolia = ensContractsFor(SEPOLIA_CHAIN_ID)

    expect(sepolia.ensDefaultReverseRegistrar.address).not.toMatch(/^0x0+$/)
    expect(sepolia.ensReverseRegistrarAdapter.address).not.toMatch(/^0x0+$/)
  })
})
