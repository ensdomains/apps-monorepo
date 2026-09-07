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

  it('does not expose OpenSea for Sepolia claims', () => {
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
    ).toBeUndefined()
  })
})
