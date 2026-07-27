import { bearerAuth } from 'hono/bearer-auth'
import { createMiddleware } from 'hono/factory'
import { type BaseEnv, createApp } from '#app/middleware/hono.js'
import { requestTokenGeneration } from '#services/commemorative-nft/generation.js'
import {
  getRenderInputKey,
  normalizeTokenId,
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

const getGeneratorBindings = (env: CloudflareBindings): GeneratorBindings =>
  env as CloudflareBindings & GeneratorBindings

const requireGeneratorAuth = createMiddleware<BaseEnv>(async (c, next) => {
  const token = getGeneratorBindings(
    c.env,
  ).COMMEMORATIVE_NFT_GENERATOR_TOKEN?.trim()
  if (!token) {
    return c.json({ error: 'Asset generation is not configured' }, 503)
  }
  return bearerAuth({ token })(c, next)
})

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

    return c.json({ error: 'Asset is being prepared' }, 503, {
      'Cache-Control': 'no-store',
      'Retry-After': '15',
    })
  })
  .post('/:tokenId/prepare', requireGeneratorAuth, async (c) => {
    let tokenId: string
    try {
      tokenId = normalizeTokenId(c.req.param('tokenId'))
    } catch {
      return c.json({ error: 'Invalid token ID' }, 400)
    }

    if (
      !(await hasObject(
        c.env.COMMEMORATIVE_NFT_BUCKET,
        getRenderInputKey(tokenId),
      ))
    ) {
      return c.json({ error: 'Asset not found' }, 404)
    }

    const generatorBindings = getGeneratorBindings(c.env)
    const generation = await requestTokenGeneration({
      generatorToken: generatorBindings.COMMEMORATIVE_NFT_GENERATOR_TOKEN,
      generatorUrl: generatorBindings.COMMEMORATIVE_NFT_GENERATOR_URL,
      tokenId,
    })

    if (generation.status === 'failed') {
      logger.error('Commemorative NFT generation request failed', {
        responseStatus: generation.responseStatus,
        tokenId,
      })
      return c.json({ error: 'Asset generation failed' }, 502)
    }

    if (generation.status === 'unavailable') {
      return c.json({ error: 'Asset generation is not configured' }, 503)
    }

    return c.json(
      { status: generation.status },
      generation.status === 'generated' ? 200 : 202,
    )
  })

export default app
