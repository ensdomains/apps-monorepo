import { describe, expect, it, vi } from 'vitest'
import {
  buildCommemorativeNftAssets,
  buildCommemorativeNftRendererUrl,
  getCommemorativeNftTokenId,
} from './config'
import {
  CommemorativeNftEligibilityError,
  fetchCommemorativeNftEligibility,
  parseCommemorativeNftEligibility,
} from './eligibility'

const ownerAddress = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const proof =
  '0x017995f95e79303c1853e326b15e6dcc16e6aa20f07372e4f0ab63c0b84f2631'
const tokenId = getCommemorativeNftTokenId(ownerAddress).toString()

const traits = {
  Era: 'DeFi',
  Depth: 'Domainer',
  Gasveteran: 'Weathered',
  Archetype: 'Abstract',
  Rarity: 'Common',
  Seed: 742_941_409,
} as const
const metadataUrl = `https://assets.example/token/${tokenId}.json`
const animationUrl = `https://ens-renderer.pages.dev/?tokenURI=${encodeURIComponent(metadataUrl)}&transparent=1`

describe('commemorative NFT eligibility', () => {
  it('parses direct traits and derives persistent assets', () => {
    const result = parseCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
      payload: {
        address: ownerAddress,
        name: 'yoginth.eth',
        token_id: tokenId,
        proof: [proof],
        traits,
        image: 'https://other.example/not-used.png',
        animation_url: animationUrl,
        external_url: 'https://renderer.example/token/1',
      },
    })

    expect(result.profileName).toBe('yoginth.eth')
    expect(result.traits).toEqual(traits)
    expect(result.assets.externalUrl).toBe('https://renderer.example/token/1')
    expect(result.assets.animationUrl).toBe(animationUrl)
    expect(result.assets.imageUrl).toBe(
      `https://assets.example/token/${tokenId}.webp`,
    )
  })

  it('maps renderer metadata attributes', () => {
    const result = parseCommemorativeNftEligibility({
      ownerAddress,
      payload: {
        address: ownerAddress,
        name: 'unwrappedyogi',
        token_id: tokenId,
        profile_name: 'yoginth.eth',
        proof: [proof],
        attributes: Object.entries(traits).map(([trait_type, value]) => ({
          trait_type,
          value,
        })),
      },
    })

    expect(result.rendererName).toBe('unwrappedyogi')
    expect(result.profileName).toBe('yoginth.eth')
    expect(result.traits.Seed).toBe(742_941_409)
  })

  it('rejects payloads without an address', () => {
    expect(() =>
      parseCommemorativeNftEligibility({
        ownerAddress,
        payload: {
          name: 'yoginth.eth',
          token_id: tokenId,
          proof: [proof],
          traits,
        },
      }),
    ).toThrow(CommemorativeNftEligibilityError)
  })

  it('fetches static token metadata and treats HTTP 404 as ineligible', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }))
    await expect(
      fetchCommemorativeNftEligibility({
        ownerAddress,
        assetOrigin: 'https://assets.example/',
        fetcher,
      }),
    ).resolves.toEqual({ status: 'ineligible' })
    expect(fetcher).toHaveBeenCalledWith(
      `https://assets.example/token/${tokenId}.json`,
    )
  })

  it('rejects malformed proofs and renderer traits', () => {
    expect(() =>
      parseCommemorativeNftEligibility({
        ownerAddress,
        payload: {
          address: ownerAddress,
          name: 'yoginth.eth',
          token_id: tokenId,
          proof: ['0x1234'],
          traits: { ...traits, Seed: -1 },
        },
      }),
    ).toThrow(CommemorativeNftEligibilityError)
  })

  it('rejects metadata for a different token ID', () => {
    expect(() =>
      parseCommemorativeNftEligibility({
        ownerAddress,
        payload: {
          address: ownerAddress,
          name: 'yoginth.eth',
          token_id: '1',
          proof: [proof],
          traits,
        },
      }),
    ).toThrow(CommemorativeNftEligibilityError)
  })

  it('ignores animation URLs that do not load the static token metadata', () => {
    const result = parseCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
      payload: {
        address: ownerAddress,
        name: 'yoginth.eth',
        token_id: tokenId,
        proof: [proof],
        traits,
        animation_url: 'https://ens-renderer.pages.dev/?tokenId=1',
      },
    })

    expect(result.assets.animationUrl).toBeUndefined()
  })

  it('derives stable token asset URLs', () => {
    expect(buildCommemorativeNftAssets(undefined, ownerAddress)).toEqual({})
    const assets = buildCommemorativeNftAssets(
      'https://assets.example/',
      ownerAddress,
    )
    expect(assets).toEqual({
      imageUrl: `https://assets.example/token/${tokenId}.webp`,
      metadataUrl: `https://assets.example/token/${tokenId}.json`,
    })
  })

  it('builds a renderer URL from validated public traits', () => {
    const eligibility = parseCommemorativeNftEligibility({
      ownerAddress,
      payload: {
        address: ownerAddress,
        name: 'yoginth.eth',
        token_id: tokenId,
        proof: [proof],
        traits,
      },
    })
    const value = buildCommemorativeNftRendererUrl({
      eligibility,
      rendererOrigin: 'https://renderer.example/',
    })
    const rendererUrl = new URL(value)
    const tokenUri = rendererUrl.searchParams.get('tokenURI')
    const metadata = JSON.parse(
      decodeURIComponent(tokenUri?.split(',')[1] ?? ''),
    )

    expect(rendererUrl.origin).toBe('https://renderer.example')
    expect(rendererUrl.searchParams.get('transparent')).toBe('1')
    expect(tokenUri).toMatch(/^data:application\/json;charset=utf-8,/)
    expect(metadata).toMatchObject({
      name: 'yoginth.eth',
      attributes: [
        { trait_type: 'Era', value: 'DeFi' },
        { trait_type: 'Depth', value: 'Domainer' },
        { trait_type: 'Gasveteran', value: 'Weathered' },
        { trait_type: 'Archetype', value: 'Abstract' },
        { trait_type: 'Rarity', value: 'Common' },
        { trait_type: 'Seed', value: 742_941_409 },
      ],
    })
    expect(value).not.toContain(proof)
  })
})
