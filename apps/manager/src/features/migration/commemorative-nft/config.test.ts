import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCommemorativeNftAssets,
  getCommemorativeNftConfig,
} from './config'

describe('commemorative NFT config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
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
