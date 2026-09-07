import { describe, expect, it, vi } from 'vitest'
import {
  buildCommemorativeNftAssets,
  buildCommemorativeNftRendererUrl,
  COMMEMORATIVE_NFT_ASSET_VERSION,
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
const versionedMetadataUrl = `${metadataUrl}?v=${COMMEMORATIVE_NFT_ASSET_VERSION}`
const versionedImageUrl = `https://assets.example/token/${tokenId}.webp?v=${COMMEMORATIVE_NFT_ASSET_VERSION}`
const versionedAnimationUrl = `https://ens-renderer.pages.dev/?tokenURI=${encodeURIComponent(versionedMetadataUrl)}&transparent=1`
const publishedTraits = {
  Era: 'Surge',
  Depth: 'Namer',
  Gasveteran: 'Fresh',
  Archetype: 'Brand',
  Rarity: 'Common',
  Seed: 3_780_441_947,
} as const
const publishedMetadata = {
  address: ownerAddress,
  name: 'yoginth',
  profile_name: 'yoginth.eth',
  token_id: tokenId,
  proof: [proof],
  seed: publishedTraits.Seed,
  attributes: Object.entries(publishedTraits).map(([trait_type, value]) => ({
    trait_type,
    value,
  })),
  image: `https://assets.example/token/${tokenId}.webp`,
  animation_url: animationUrl,
}

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
    expect(result.assets.animationUrl).toBe(versionedAnimationUrl)
    expect(result.assets.imageUrl).toBe(versionedImageUrl)
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

  it.each([
    404, 410,
  ])('treats missing published JSON with HTTP %s as ineligible', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }))
    await expect(
      fetchCommemorativeNftEligibility({
        ownerAddress,
        assetOrigin: 'https://assets.example/',
        fetcher,
      }),
    ).resolves.toEqual({ status: 'ineligible' })
    expect(fetcher).toHaveBeenCalledWith(versionedMetadataUrl)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('uses one JSON request without an image probe and preserves published metadata inputs', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(publishedMetadata))

    await expect(
      fetchCommemorativeNftEligibility({
        ownerAddress,
        assetOrigin: 'https://assets.example',
        fetcher,
      }),
    ).resolves.toEqual({
      status: 'eligible',
      eligibility: {
        ownerAddress,
        profileName: 'yoginth.eth',
        rendererName: 'yoginth',
        proof: [proof],
        traits: publishedTraits,
        assets: {
          metadataUrl: versionedMetadataUrl,
          imageUrl: versionedImageUrl,
          animationUrl: versionedAnimationUrl,
          externalUrl: undefined,
        },
        source: 'static',
      },
    })
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(versionedMetadataUrl)
  })

  it('returns unavailable when no published asset origin is configured', async () => {
    const fetcher = vi.fn()

    await expect(
      fetchCommemorativeNftEligibility({ ownerAddress, fetcher }),
    ).resolves.toEqual({ status: 'unavailable' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps metadata fetch failures retryable without substituting artwork', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))

    await expect(
      fetchCommemorativeNftEligibility({
        ownerAddress,
        assetOrigin: 'https://assets.example',
        fetcher,
      }),
    ).rejects.toThrow('Eligibility request failed with HTTP 503')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps published metadata network failures retryable', async () => {
    const error = new Error('Network unavailable')
    const fetcher = vi.fn().mockRejectedValueOnce(error)

    await expect(
      fetchCommemorativeNftEligibility({
        ownerAddress,
        assetOrigin: 'https://assets.example',
        fetcher,
      }),
    ).rejects.toBe(error)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(versionedMetadataUrl)
  })

  it.each([
    '{}',
    'invalid JSON',
  ])('rejects malformed published JSON: %s', async (body) => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(body, {
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(
      fetchCommemorativeNftEligibility({
        ownerAddress,
        assetOrigin: 'https://assets.example',
        fetcher,
      }),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
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

  it('rejects metadata belonging to a different owner', () => {
    expect(() =>
      parseCommemorativeNftEligibility({
        ownerAddress,
        payload: {
          ...publishedMetadata,
          address: '0x0000000000000000000000000000000000000001',
        },
      }),
    ).toThrow('Eligibility payload does not belong to the connected address')
  })

  it.each([
    'https://ens-renderer.pages.dev/?tokenId=1',
    `https://ens-renderer.pages.dev/?tokenURI=${encodeURIComponent('https://assets.example/token/1.json')}`,
    `https://ens-renderer.pages.dev/?tokenURI=${encodeURIComponent(`https://other.example/token/${tokenId}.json`)}`,
  ])('ignores animation URLs that do not load the static token metadata: %s', (url) => {
    const result = parseCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
      payload: {
        address: ownerAddress,
        name: 'yoginth.eth',
        token_id: tokenId,
        proof: [proof],
        traits,
        animation_url: url,
      },
    })

    expect(result.assets.animationUrl).toBeUndefined()
  })

  it('updates existing cache versions in renderer and share URLs', () => {
    const previousUrl = new URL(animationUrl)
    previousUrl.searchParams.set('tokenURI', `${metadataUrl}?v=old`)
    previousUrl.searchParams.set('quality', 'high')
    const result = parseCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
      payload: {
        ...publishedMetadata,
        animation_url: previousUrl.toString(),
        external_url: previousUrl.toString(),
      },
    })

    const expectedUrl = new URL(versionedAnimationUrl)
    expectedUrl.searchParams.set('quality', 'high')
    expect(result.assets.animationUrl).toBe(expectedUrl.toString())
    expect(result.assets.externalUrl).toBe(expectedUrl.toString())
  })

  it('derives stable token asset URLs', () => {
    expect(buildCommemorativeNftAssets(undefined, ownerAddress)).toEqual({})
    const assets = buildCommemorativeNftAssets(
      'https://assets.example/',
      ownerAddress,
    )
    expect(assets).toEqual({
      imageUrl: versionedImageUrl,
      metadataUrl: versionedMetadataUrl,
    })
  })

  it('loads the published JSON directly in the renderer', () => {
    const eligibility = parseCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
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
    const rendererUrl = new URL(value ?? '')
    const tokenUri = rendererUrl.searchParams.get('tokenURI')

    expect(rendererUrl.origin).toBe('https://renderer.example')
    expect(rendererUrl.searchParams.get('transparent')).toBe('1')
    expect(tokenUri).toBe(versionedMetadataUrl)
    expect(value).not.toContain(proof)
  })

  it('does not synthesize renderer metadata when published JSON is unavailable', () => {
    const eligibility = parseCommemorativeNftEligibility({
      ownerAddress,
      payload: publishedMetadata,
    })

    expect(
      buildCommemorativeNftRendererUrl({
        eligibility,
        rendererOrigin: 'https://renderer.example/',
      }),
    ).toBeUndefined()
  })
})
