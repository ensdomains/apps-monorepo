import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCommemorativeNftAssets,
  getCommemorativeNftConfig,
} from './config'
import { commemorativeNftEligibilityQueryOptions } from './queries'

describe('commemorative NFT config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses the configured renderer origin', () => {
    vi.stubEnv(
      'VITE_COMMEMORATIVE_NFT_RENDERER_ORIGIN',
      '  https://renderer.example///  ',
    )

    expect(getCommemorativeNftConfig().rendererOrigin).toBe(
      'https://renderer.example',
    )
  })

  it('falls back to the default renderer origin', () => {
    vi.stubEnv('VITE_COMMEMORATIVE_NFT_RENDERER_ORIGIN', '')

    expect(getCommemorativeNftConfig().rendererOrigin).toBe(
      'https://nft.ens.dev',
    )
  })

  it('uses the immutable R2 origin by default', () => {
    vi.stubEnv('VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN', '')

    expect(getCommemorativeNftConfig().assetOrigin).toBe(
      'https://nft-assets.ens.dev',
    )
  })

  it.each([
    'not a URL',
    'javascript:alert(1)',
    'https://user:password@assets.example',
    'https://assets.example/path',
    'https://assets.example?debug=1',
    'https://assets.example#fragment',
    'http://assets.example',
  ])('disables malformed or unsafe origins without throwing: %s', (origin) => {
    vi.stubEnv('VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN', origin)
    expect(getCommemorativeNftConfig()).toMatchObject({ isValid: false })
    expect(() => new URL(getCommemorativeNftConfig().assetOrigin)).not.toThrow()
  })

  it('only allows local HTTP in development', () => {
    vi.stubEnv(
      'VITE_COMMEMORATIVE_NFT_RENDERER_ORIGIN',
      'http://localhost:4000',
    )
    vi.stubEnv('DEV', false)
    expect(getCommemorativeNftConfig().isValid).toBe(false)
    vi.stubEnv('DEV', true)
    expect(getCommemorativeNftConfig()).toMatchObject({
      isValid: true,
      rendererOrigin: 'http://localhost:4000',
    })
  })

  it('reuses the validated configuration object', () => {
    expect(getCommemorativeNftConfig()).toBe(getCommemorativeNftConfig())
  })

  it('never fetches default assets after an invalid configuration, even on manual refetch', async () => {
    vi.stubEnv('VITE_COMMEMORATIVE_NFT_RENDERER_ORIGIN', 'invalid')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const client = new QueryClient()
    await expect(
      client.fetchQuery(
        commemorativeNftEligibilityQueryOptions({
          ownerAddress: '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF',
        }),
      ),
    ).resolves.toEqual({ status: 'unavailable' })
    expect(fetcher).not.toHaveBeenCalled()
    client.clear()
  })

  it.each([
    'https://nft-assets.ens.dev',
    'https://nft-assets.ens.dev///',
  ])('matches the contract metadata path and published image path at %s', (assetOrigin) => {
    expect(
      buildCommemorativeNftAssets(
        assetOrigin,
        '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF',
      ),
    ).toEqual({
      metadataUrl:
        'https://nft-assets.ens.dev/token/46455108410614081663945406319915307572171076188378075311311703967581922008221.json',
      imageUrl:
        'https://nft-assets.ens.dev/token/46455108410614081663945406319915307572171076188378075311311703967581922008221/image.webp',
    })
  })
})
