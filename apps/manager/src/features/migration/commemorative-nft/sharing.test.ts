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
      text: 'Upgraded to ENSv2. Preview my card.',
    },
    {
      minted: true,
      text: 'Upgraded to ENSv2 and minted my card.',
    },
  ])('shares accurate mint status when minted is $minted', ({
    minted,
    text,
  }) => {
    const externalUrl = 'https://example.com/nft/hello world'
    const urls = buildCommemorativeNftShareUrls(externalUrl, minted)

    expect(urls.external).toBe(externalUrl)
    expect(urls.message).toBe(`${text}\n${externalUrl}`)
    for (const intent of [urls.x, urls.telegram]) {
      expect(intent).toBeDefined()
      const params = new URL(intent ?? '').searchParams
      expect(params.get('text')).toBe(text)
      expect(params.get('url')).toBe(externalUrl)
    }
  })

  it('links directly to the token viewer on the configured renderer', () => {
    const publicUrl = buildCommemorativeNftPublicUrl({
      ownerAddress,
      rendererOrigin: 'https://renderer.example',
    })
    expect(publicUrl).toBe(
      'https://renderer.example/nft/?tokenId=46455108410614081663945406319915307572171076188378075311311703967581922008221',
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

  it('does not expose OpenSea for minted Sepolia NFTs after testnet support ended', () => {
    expect(
      buildCommemorativeNftMarketplaceUrl({
        chainId: 11155111,
        ownerAddress,
        minted: true,
      }),
    ).toBeUndefined()
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
