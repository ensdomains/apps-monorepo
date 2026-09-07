import { describe, expect, it } from 'vitest'
import {
  buildCommemorativeNftMarketplaceUrl,
  buildCommemorativeNftProfileUrl,
  buildCommemorativeNftShareUrls,
  isCommemorativeNftCanonicalProfile,
} from './sharing'

const ownerAddress = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'

describe('commemorative NFT sharing', () => {
  it('matches only the canonical name profile', () => {
    expect(
      isCommemorativeNftCanonicalProfile('Yoginth.eth.', 'yoginth.eth'),
    ).toBe(true)
    expect(
      isCommemorativeNftCanonicalProfile('another.eth', 'yoginth.eth'),
    ).toBe(false)
  })

  it('builds encoded share intents only when an external URL exists', () => {
    expect(buildCommemorativeNftShareUrls(undefined, false)).toEqual({})
    expect(buildCommemorativeNftShareUrls(undefined, true)).toEqual({})
    const urls = buildCommemorativeNftShareUrls(
      'https://example.com/nft/hello world',
      false,
    )
    expect(urls.x).toContain('x.com/intent/post')
    expect(urls.x).toContain('hello+world')
    expect(urls.telegram).toContain('t.me/share/url')
  })

  it.each([
    {
      minted: false,
      text: 'I upgraded to ENSv2. Take a look at my commemorative NFT.',
    },
    {
      minted: true,
      text: 'I upgraded to ENSv2 and minted my commemorative NFT.',
    },
  ])('shares accurate mint status when minted is $minted', ({
    minted,
    text,
  }) => {
    const externalUrl = 'https://example.com/nft/hello world'
    const urls = buildCommemorativeNftShareUrls(externalUrl, minted)

    expect(urls.external).toBe(externalUrl)
    for (const intent of [urls.x, urls.telegram]) {
      expect(intent).toBeDefined()
      const params = new URL(intent ?? '').searchParams
      expect(params.get('text')).toBe(text)
      expect(params.get('url')).toBe(externalUrl)
    }
  })

  it('builds a Manager profile fallback on the active environment', () => {
    expect(buildCommemorativeNftProfileUrl('Yoginth.eth.')).toBe(
      new URL('/p/yoginth.eth', window.location.origin).toString(),
    )
    expect(
      buildCommemorativeNftProfileUrl(
        'Yoginth.eth.',
        'https://staging.example/',
      ),
    ).toBe('https://staging.example/p/yoginth.eth')
    expect(
      buildCommemorativeNftProfileUrl(
        'Yoginth.eth.',
        'https://app.ens.domains',
      ),
    ).toBe('https://app.ens.domains/p/yoginth.eth')
    expect(
      buildCommemorativeNftProfileUrl(
        'hello world.eth',
        'https://app.ens.domains',
      ),
    ).toBe('https://app.ens.domains/p/hello%20world.eth')
  })

  it('does not expose OpenSea before minting', () => {
    expect(
      buildCommemorativeNftMarketplaceUrl({
        chainId: 11155111,
        ownerAddress,
        minted: false,
      }),
    ).toBeUndefined()
  })

  it('uses mainnet OpenSea for a minted NFT on a configured chain', () => {
    expect(
      buildCommemorativeNftMarketplaceUrl({
        chainId: 11155111,
        ownerAddress,
        minted: true,
      }),
    ).toBe(
      'https://opensea.io/assets/ethereum/0xe49A9D706FCD82AA575496352B5633F80fBBC449/46455108410614081663945406319915307572171076188378075311311703967581922008221',
    )
  })

  it('does not expose OpenSea without a configured contract', () => {
    expect(
      buildCommemorativeNftMarketplaceUrl({
        chainId: 10,
        ownerAddress,
        minted: true,
      }),
    ).toBeUndefined()
  })
})
