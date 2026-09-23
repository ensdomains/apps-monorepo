import { supportedL1Chains } from '@ensdomains/ensjs/chain'
import { describe, expect, it } from 'vitest'
import { isKnownPublicResolver } from './knownResolvers'

const SEPOLIA = supportedL1Chains.sepolia

describe('isKnownPublicResolver', () => {
  it.each([
    ['null', null, false],
    ['empty string', '', false],
    [
      'known resolver (lowercase)',
      '0x640294a2b2d87e7f522db3e3e3e876764bce170d',
      true,
    ],
    [
      'known resolver (checksum)',
      '0x1da022710dF5002339274AaDEe8D58218e9D6AB5',
      true,
    ],
    [
      'known resolver (uppercase)',
      '0xC30BA2BD21583605D815826C3807E8224E398E10',
      true,
    ],
    [
      'known legacy Sepolia V1 PublicResolver',
      '0xe99638b40e4fff0129d56f03b55b6bbc4bbe49b5',
      true,
    ],
    [
      'known Sepolia PublicResolver',
      '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
      true,
    ],
    ['unknown resolver', '0x0000000000000000000000000000000000000001', false],
  ])('returns %s → %s', (_, input, expected) => {
    expect(isKnownPublicResolver(input, SEPOLIA)).toBe(expected)
  })

  // A name can point its resolver at any address, including one that only has
  // code on another chain, so the lists must not be shared across networks.
  it("does not accept another network's resolver", () => {
    const sepoliaOnly = '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5'

    expect(isKnownPublicResolver(sepoliaOnly, SEPOLIA)).toBe(true)
    expect(isKnownPublicResolver(sepoliaOnly, supportedL1Chains.mainnet)).toBe(
      false,
    )
  })

  // These two were in the Sepolia list but have no bytecode on Sepolia and
  // real code on mainnet, so they were mis-filed.
  it('keeps historical mainnet resolvers on mainnet', () => {
    const olderMainnetResolver = '0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41'

    expect(
      isKnownPublicResolver(olderMainnetResolver, supportedL1Chains.mainnet),
    ).toBe(true)
    expect(isKnownPublicResolver(olderMainnetResolver, SEPOLIA)).toBe(false)
  })

  it('treats an unknown chain as having no known resolvers', () => {
    expect(
      isKnownPublicResolver('0x640294a2b2d87e7f522db3e3e3e876764bce170d', 1234),
    ).toBe(false)
  })
})
