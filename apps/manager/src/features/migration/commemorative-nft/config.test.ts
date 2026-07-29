import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCommemorativeNftPrepareUrl,
  DEFAULT_COMMEMORATIVE_NFT_RENDERER_ORIGIN,
  getCommemorativeNftConfig,
  getCommemorativeNftTokenId,
} from './config'

const ownerAddress = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'

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
      DEFAULT_COMMEMORATIVE_NFT_RENDERER_ORIGIN,
    )
  })

  it('falls back to the staging asset and eligibility origins', () => {
    vi.stubEnv('VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN', '')
    vi.stubEnv('VITE_COMMEMORATIVE_NFT_ELIGIBILITY_ORIGIN', '')

    expect(getCommemorativeNftConfig()).toMatchObject({
      assetOrigin: 'https://app-api.ens.dev/v1/commemorative-nft',
      eligibilityOrigin:
        'https://pub-43406b099825402eb42ecfb3494a902b.r2.dev/eligibility',
    })
  })

  it('keeps asset and eligibility origins configurable', () => {
    vi.stubEnv(
      'VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN',
      '  https://api.example/assets///  ',
    )
    vi.stubEnv(
      'VITE_COMMEMORATIVE_NFT_ELIGIBILITY_ORIGIN',
      '  https://r2.example/eligibility///  ',
    )

    expect(getCommemorativeNftConfig()).toMatchObject({
      assetOrigin: 'https://api.example/assets',
      eligibilityOrigin: 'https://r2.example/eligibility',
    })
  })

  it('builds the preparation endpoint from the address-derived token ID', () => {
    expect(
      buildCommemorativeNftPrepareUrl(
        'https://api.example/v1/commemorative-nft/',
        ownerAddress,
      ),
    ).toBe(
      `https://api.example/v1/commemorative-nft/${getCommemorativeNftTokenId(ownerAddress)}/prepare`,
    )
  })
})
