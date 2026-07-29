import { Container } from '@cloudflare/containers'

export type CommemorativeNftGeneratorBindings = CloudflareBindings & {
  readonly COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN: string
  readonly COMMEMORATIVE_NFT_R2_ACCESS_KEY_ID: string
  readonly COMMEMORATIVE_NFT_R2_ACCOUNT_ID: string
  readonly COMMEMORATIVE_NFT_R2_SECRET_ACCESS_KEY: string
}

export class CommemorativeNftGeneratorContainer extends Container<CommemorativeNftGeneratorBindings> {
  defaultPort = 3000
  requiredPorts = [3000]
  sleepAfter = '10m'
  enableInternet = true

  constructor(
    ctx: DurableObjectState<object>,
    env: CommemorativeNftGeneratorBindings,
  ) {
    super(ctx, env)
    this.envVars = {
      CAPTURE_TIMEOUT_MS: '600000',
      GENERATOR_AUTH_TOKEN: env.COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN,
      NFT_EXTERNAL_ORIGIN: env.COMMEMORATIVE_NFT_EXTERNAL_ORIGIN,
      NFT_PUBLIC_ASSET_ORIGIN: env.COMMEMORATIVE_NFT_ASSET_ORIGIN,
      R2_ACCESS_KEY_ID: env.COMMEMORATIVE_NFT_R2_ACCESS_KEY_ID,
      R2_ACCOUNT_ID: env.COMMEMORATIVE_NFT_R2_ACCOUNT_ID,
      R2_BUCKET_NAME: 'ensv2-commemorative-nft-staging',
      R2_PUBLIC_ORIGIN: env.COMMEMORATIVE_NFT_R2_PUBLIC_ORIGIN,
      R2_SECRET_ACCESS_KEY: env.COMMEMORATIVE_NFT_R2_SECRET_ACCESS_KEY,
      RENDERER_ORIGIN: env.COMMEMORATIVE_NFT_RENDERER_ORIGIN,
      RENDERER_REVISION: env.COMMEMORATIVE_NFT_RENDERER_REVISION,
    }
  }

  override onError(error: unknown): void {
    console.error('Commemorative NFT generator container failed', error)
  }
}
