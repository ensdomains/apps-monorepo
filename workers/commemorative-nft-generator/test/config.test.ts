import { describe, expect, it } from 'vitest'
import { loadGeneratorConfig } from '../src/config.js'

const ENVIRONMENT = {
  GENERATOR_AUTH_TOKEN: 'secret',
  R2_ACCESS_KEY_ID: 'access',
  R2_ACCOUNT_ID: 'account',
  R2_PUBLIC_ORIGIN: 'https://pub.example/',
  R2_SECRET_ACCESS_KEY: 'secret-access',
}

describe('generator config', () => {
  it('uses staging-safe defaults', () => {
    expect(loadGeneratorConfig(ENVIRONMENT)).toMatchObject({
      port: 3000,
      publicAssetOrigin: 'https://pub.example/tokens',
      r2BucketName: 'ensv2-commemorative-nft-staging',
      rendererOrigin: 'https://ens-renderer.pages.dev',
    })
  })

  it('requires write credentials and an auth token', () => {
    expect(() =>
      loadGeneratorConfig({ ...ENVIRONMENT, R2_SECRET_ACCESS_KEY: '' }),
    ).toThrow('R2_SECRET_ACCESS_KEY is required')
  })
})
