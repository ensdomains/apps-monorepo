import { describe, expect, it, vi } from 'vitest'
import {
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
const publishedRendererUrl = `https://nft.ens.dev/?tokenId=${tokenId}&transparent=1`
const imageUrl = `https://assets.example/token/${tokenId}/image.webp`
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
  image: `https://assets.example/token/${tokenId}/image.webp`,
  animation_url: publishedRendererUrl,
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
        animation_url: publishedRendererUrl,
        external_url: 'https://renderer.example/token/1',
      },
    })

    expect(result.profileName).toBe('yoginth.eth')
    expect(result.traits).toEqual(traits)
    expect(result.assets.externalUrl).toBe('https://renderer.example/token/1')
    expect(result.assets.imageUrl).toBe(imageUrl)
  })

  it.each([
    publishedRendererUrl,
    'https://other.example/artwork',
    null,
    42,
  ])('ignores unused published animation URLs when deriving assets: %j', (animationUrl) => {
    const result = parseCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
      payload: { ...publishedMetadata, animation_url: animationUrl },
    })

    expect(result.assets).toEqual({
      metadataUrl,
      imageUrl,
      externalUrl: undefined,
    })
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
    expect(fetcher).toHaveBeenCalledWith(metadataUrl, {
      signal: expect.any(AbortSignal),
    })
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
          metadataUrl,
          imageUrl,
          externalUrl: undefined,
        },
        source: 'static',
      },
    })
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(metadataUrl, {
      signal: expect.any(AbortSignal),
    })
  })

  it('returns unavailable when no published asset origin is configured', async () => {
    const fetcher = vi.fn()

    await expect(
      fetchCommemorativeNftEligibility({ ownerAddress, fetcher }),
    ).resolves.toEqual({ status: 'unavailable' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('aborts a metadata request when its owner query is cancelled', async () => {
    const controller = new AbortController()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(init.signal?.reason),
            ),
          ),
      )
    const result = fetchCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
      fetcher,
      signal: controller.signal,
    })
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
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
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(metadataUrl, {
      signal: expect.any(AbortSignal),
    })
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
    'https://nft.ens.dev/?tokenId=1',
    'https://nft.ens.dev/?tokenId=',
    `https://nft.ens.dev/?tokenId=0${tokenId}`,
    `https://nft.ens.dev/?tokenId=${tokenId}&tokenId=${tokenId}`,
    `https://nft.ens.dev/?tokenId=${tokenId}&tokenId=1`,
    `https://nft.ens.dev/?tokenURI=${encodeURIComponent(metadataUrl)}`,
    `${publishedRendererUrl}&tokenURI=`,
    `${publishedRendererUrl}&tokenURI=${encodeURIComponent(metadataUrl)}`,
  ])('ignores share URLs with invalid token parameters: %s', (url) => {
    const result = parseCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
      payload: {
        address: ownerAddress,
        name: 'yoginth.eth',
        token_id: tokenId,
        proof: [proof],
        traits,
        external_url: url,
      },
    })

    expect(result.assets.externalUrl).toBeUndefined()
  })

  it('preserves ordinary external links', () => {
    const url = 'https://example.com/profile/yoginth.eth?ref=nft'
    const result = parseCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
      payload: {
        ...publishedMetadata,
        external_url: url,
      },
    })

    expect(result.assets.externalUrl).toBe(url)
  })

  it('preserves other parameters in valid renderer share URLs', () => {
    const url = new URL(publishedRendererUrl)
    url.searchParams.set('quality', 'high')
    const result = parseCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
      payload: {
        ...publishedMetadata,
        external_url: url.toString(),
      },
    })

    expect(result.assets.externalUrl).toBe(url.toString())
  })

  it('loads the published token by ID in the renderer', () => {
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

    expect(rendererUrl.origin).toBe('https://renderer.example')
    expect(rendererUrl.searchParams.get('transparent')).toBe('1')
    expect(rendererUrl.searchParams.getAll('tokenId')).toEqual([tokenId])
    expect(rendererUrl.searchParams.has('tokenURI')).toBe(false)
    expect(value).not.toContain(proof)
  })

  it('replaces stale token parameters in the configured renderer URL', () => {
    const eligibility = parseCommemorativeNftEligibility({
      ownerAddress,
      assetOrigin: 'https://assets.example',
      payload: publishedMetadata,
    })
    const value = buildCommemorativeNftRendererUrl({
      eligibility,
      rendererOrigin:
        'https://renderer.example/?tokenURI=old&tokenURI=older&tokenId=1&tokenId=2&quality=high&transparent=0',
    })
    const url = new URL(value ?? '')

    expect(url.searchParams.getAll('tokenId')).toEqual([tokenId])
    expect(url.searchParams.has('tokenURI')).toBe(false)
    expect(url.searchParams.get('transparent')).toBe('1')
    expect(url.searchParams.get('quality')).toBe('high')
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
