import { createApp } from '#app/middleware/hono.js'
import { requestTokenGeneration } from '#services/commemorative-nft/generation.js'
import {
  getRenderInputKey,
  parseTokenAsset,
} from '#services/commemorative-nft/keys.js'
import {
  getTokenAsset,
  hasObject,
  tokenAssetResponse,
} from '#services/commemorative-nft/storage.js'
import { logger } from '#utils/logger.js'

type GeneratorBindings = {
  readonly COMMEMORATIVE_NFT_GENERATOR_TOKEN?: string
  readonly COMMEMORATIVE_NFT_GENERATOR_URL?: string
}

const app = createApp()
  .basePath('/v1/commemorative-nft')
  .on(['GET', 'HEAD'], '/:asset', async (c) => {
    const asset = parseTokenAsset(c.req.param('asset'))
    if (!asset) return c.json({ error: 'Asset not found' }, 404)

    const stored = await getTokenAsset(
      c.env.COMMEMORATIVE_NFT_BUCKET,
      asset.key,
    )
    if (stored) return tokenAssetResponse(stored, c.req.raw)

    if (
      !(await hasObject(
        c.env.COMMEMORATIVE_NFT_BUCKET,
        getRenderInputKey(asset.tokenId),
      ))
    ) {
      return c.json({ error: 'Asset not found' }, 404)
    }

    const generatorBindings = c.env as CloudflareBindings & GeneratorBindings
    const generation = await requestTokenGeneration({
      generatorToken: generatorBindings.COMMEMORATIVE_NFT_GENERATOR_TOKEN,
      generatorUrl: generatorBindings.COMMEMORATIVE_NFT_GENERATOR_URL,
      tokenId: asset.tokenId,
    })

    if (generation.status === 'generated') {
      const generated = await getTokenAsset(
        c.env.COMMEMORATIVE_NFT_BUCKET,
        asset.key,
      )
      if (generated) return tokenAssetResponse(generated, c.req.raw)
    }

    if (generation.status === 'failed') {
      logger.error('Commemorative NFT generation request failed', {
        responseStatus: generation.responseStatus,
        tokenId: asset.tokenId,
      })
      return c.json({ error: 'Asset generation failed' }, 502)
    }

    return c.json(
      {
        error:
          generation.status === 'unavailable'
            ? 'Asset generation is not configured'
            : 'Asset is being prepared',
      },
      503,
      { 'Cache-Control': 'no-store', 'Retry-After': '15' },
    )
  })

export default app
