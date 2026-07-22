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
    expect(buildCommemorativeNftShareUrls(undefined)).toEqual({})
    const urls = buildCommemorativeNftShareUrls(
      'https://example.com/nft/hello world',
    )
    expect(urls.x).toContain('x.com/intent/post')
    expect(urls.x).toContain('hello+world')
    expect(urls.telegram).toContain('t.me/share/url')
  })

  it('builds a canonical Manager profile fallback for sharing', () => {
    expect(buildCommemorativeNftProfileUrl('Yoginth.eth.')).toBe(
      'https://app.ens.domains/p/yoginth.eth',
    )
    expect(buildCommemorativeNftProfileUrl('hello world.eth')).toBe(
      'https://app.ens.domains/p/hello%20world.eth',
    )
  })

  it('only exposes OpenSea after a Sepolia mint', () => {
    expect(
      buildCommemorativeNftMarketplaceUrl({
        chainId: 11155111,
        ownerAddress,
        minted: false,
      }),
    ).toBeUndefined()
    expect(
      buildCommemorativeNftMarketplaceUrl({
        chainId: 11155111,
        ownerAddress,
        minted: true,
      }),
    ).toContain('testnets.opensea.io/assets/sepolia')
  })
})
