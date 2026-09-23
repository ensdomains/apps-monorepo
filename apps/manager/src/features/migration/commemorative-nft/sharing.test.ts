import { afterEach, describe, expect, it, vi } from 'vitest'
import * as config from './config'
import {
  buildCommemorativeNftMarketplaceUrl,
  buildCommemorativeNftPublicUrl,
  buildCommemorativeNftShareUrls,
  isCommemorativeNftCanonicalProfile,
} from './sharing'

const ownerAddress = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'

describe('commemorative NFT sharing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('matches only the canonical name profile', () => {
    expect(
      isCommemorativeNftCanonicalProfile('Yoginth.eth.', 'yoginth.eth'),
    ).toBe(true)
    expect(
      isCommemorativeNftCanonicalProfile('another.eth', 'yoginth.eth'),
    ).toBe(false)
  })

  it('builds encoded share intents only for a minted NFT with an external URL', () => {
    expect(buildCommemorativeNftShareUrls(undefined, false)).toEqual({})
    expect(buildCommemorativeNftShareUrls(undefined, true)).toEqual({})
    expect(
      buildCommemorativeNftShareUrls(
        'https://example.com/nft/hello world',
        false,
      ),
    ).toEqual({})
    const urls = buildCommemorativeNftShareUrls(
      'https://example.com/nft/hello world',
      true,
    )
    expect(urls.x).toContain('x.com/intent/post')
    expect(urls.x).toContain('hello+world')
    expect(urls.telegram).toContain('t.me/share/url')
  })

  it('shares the minted card and its public URL', () => {
    const externalUrl = 'https://example.com/nft/hello world'
    const urls = buildCommemorativeNftShareUrls(externalUrl, true)
    const text = 'Upgraded to ENSv2 and minted my card.'

    expect(urls.external).toBe(externalUrl)
    expect(urls.message).toBe(`${text}\n${externalUrl}`)
    for (const intent of [urls.x, urls.telegram]) {
      expect(intent).toBeDefined()
      const params = new URL(intent ?? '').searchParams
      expect(params.get('text')).toBe(text)
      expect(params.get('url')).toBe(externalUrl)
    }
  })

  it.each([
    'https://nft.ens.dev',
    'https://renderer.example/',
    'http://localhost:4000',
  ])('builds the standalone NFT URL on %s', (rendererOrigin) => {
    expect(
      buildCommemorativeNftPublicUrl({ ownerAddress, rendererOrigin }),
    ).toBe(
      `${new URL(rendererOrigin).origin}/nft/?tokenId=46455108410614081663945406319915307572171076188378075311311703967581922008221`,
    )
  })

  it('does not expose OpenSea before minting', () => {
    vi.spyOn(config, 'getCommemorativeNftContractAddress').mockReturnValue(
      '0x0000000000000000000000000000000000000001',
    )

    expect(
      buildCommemorativeNftMarketplaceUrl({
        chainId: 1,
        ownerAddress,
        minted: false,
      }),
    ).toBeUndefined()
  })

  it('links a minted Sepolia NFT using its contract and token ID', () => {
    expect(
      buildCommemorativeNftMarketplaceUrl({
        chainId: 11155111,
        ownerAddress,
        minted: true,
      }),
    ).toBe(
      'https://testnets.opensea.io/assets/sepolia/0x0bc4FB733Ca8BAD5FaDeb1BEc4bE9C93A5aD55D1/46455108410614081663945406319915307572171076188378075311311703967581922008221',
    )
  })

  it('links a minted NFT to Ethereum OpenSea when its mainnet contract is configured', () => {
    vi.spyOn(config, 'getCommemorativeNftContractAddress').mockReturnValue(
      '0x0000000000000000000000000000000000000001',
    )

    expect(
      buildCommemorativeNftMarketplaceUrl({
        chainId: 1,
        ownerAddress,
        minted: true,
      }),
    ).toBe(
      'https://opensea.io/assets/ethereum/0x0000000000000000000000000000000000000001/46455108410614081663945406319915307572171076188378075311311703967581922008221',
    )
  })

  it.each([
    1, 10,
  ])('does not expose OpenSea without a configured contract on chain %s', (chainId) => {
    expect(
      buildCommemorativeNftMarketplaceUrl({
        chainId,
        ownerAddress,
        minted: true,
      }),
    ).toBeUndefined()
  })
})
