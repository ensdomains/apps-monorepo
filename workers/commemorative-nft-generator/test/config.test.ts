import { describe, expect, it } from 'vitest'
import { loadGeneratorConfig } from '../src/config.js'

const ENVIRONMENT = {
  GENERATOR_AUTH_TOKEN: 'secret',
  NFT_PUBLIC_ASSET_ORIGIN: 'https://app-api.ens.dev/v1/commemorative-nft/',
  R2_ACCESS_KEY_ID: 'access',
  R2_ACCOUNT_ID: 'account',
  R2_PUBLIC_ORIGIN: 'https://pub.example/',
  R2_SECRET_ACCESS_KEY: 'secret-access',
  RENDERER_REVISION: 'sha256:renderer',
}

describe('generator config', () => {
  it('uses staging-safe defaults and canonical origins', () => {
    expect(loadGeneratorConfig(ENVIRONMENT)).toMatchObject({
      port: 3000,
      publicAssetOrigin: 'https://app-api.ens.dev/v1/commemorative-nft',
      r2BucketName: 'ensv2-commemorative-nft-staging',
      rendererOrigin: 'https://ens-renderer.pages.dev',
      rendererRevision: 'sha256:renderer',
    })
  })

  it('requires bucket-scoped credentials and a renderer revision', () => {
    expect(() =>
      loadGeneratorConfig({ ...ENVIRONMENT, R2_SECRET_ACCESS_KEY: '' }),
    ).toThrow('R2_SECRET_ACCESS_KEY is required')
    expect(() =>
      loadGeneratorConfig({ ...ENVIRONMENT, RENDERER_REVISION: '' }),
    ).toThrow('RENDERER_REVISION is required')
  })
})
