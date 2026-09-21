import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { getEnsContracts, getSupportedTokens, getTokens } from './contracts'
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

describe('getEnsContracts', () => {
  it.each(
    Object.entries(getEnsContracts(SEPOLIA_CHAIN_ID)),
  )('sepolia %s is a checksummed address', (label, address) => {
    expectChecksummed(label, address)
  })

  it('refuses a chain with no ENS deployment instead of guessing', () => {
    expect(() => getEnsContracts(1234)).toThrow(NetworkConfigError)
  })

  // The reverse-registrar adapters are not in ensjs, so a network without them
  // must fail loudly rather than hand back a placeholder.
  it('names the missing contract when a network has no deployment for it', () => {
    expect(() => getEnsContracts(NETWORKS.mainnet.chainId)).toThrow(
      /DefaultReverseRegistrar has no deployment on mainnet/,
    )
  })
})

describe('token maps', () => {
  it.each(
    Object.entries(getSupportedTokens(SEPOLIA_CHAIN_ID)),
  )('SUPPORTED_TOKENS.%s is a checksummed address', (label, address) => {
    expectChecksummed(label, address)
  })

  it.each(
    Object.entries(getTokens(SEPOLIA_CHAIN_ID)),
  )('TOKENS.%s.address is a checksummed address', (label, token) => {
    expectChecksummed(label, token.address)
  })

  // Every network's tokens come from ensjs, so they are worth checking too.
  it.each(ENS_NETWORKS)('%s tokens are checksummed', (network) => {
    for (const [label, token] of Object.entries(
      getTokens(NETWORKS[network].chainId),
    )) {
      expectChecksummed(`${network}.${label}`, token.address)
    }
  })
})
