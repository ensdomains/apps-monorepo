import { type BaseEnv, createApp } from '#app/middleware/hono.js'
import {
  parseCanonicalTokenId,
  parseTokenAsset,
  type TokenAsset,
} from '#services/commemorative-nft/assets.js'
import {
  type CommemorativeNftGenerationBindings,
  createKvGenerationAdmission,
  createWorkflowGenerationCoordinator,
  GENERATION_RETRY_WINDOW_SECONDS,
  type GenerationCoordinator,
  type GenerationPreparationStatus,
} from '#services/commemorative-nft/generation.js'
import { isRemoteGeneratorConfigured } from '#services/commemorative-nft/generatorClient.js'
import {
  createSepoliaTokenOwnershipReader,
  type TokenOwnershipReader,
} from '#services/commemorative-nft/ownership.js'
import {
  getTokenAssetResponse,
  hasRenderInput,
  hasVerifiedTokenCompletion,
} from '#services/commemorative-nft/storage.js'

const RETRY_AFTER_SECONDS = 15

interface CommemorativeNftBindings extends CommemorativeNftGenerationBindings {
  readonly COMMEMORATIVE_NFT_BUCKET?: R2Bucket
  readonly COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN?: string
  readonly COMMEMORATIVE_NFT_GENERATOR_ORIGIN?: string
}

type CommemorativeNftWorkerBindings = CloudflareBindings &
  CommemorativeNftBindings

type CommemorativeNftEnv = BaseEnv & {
  Bindings: CommemorativeNftWorkerBindings
}

interface CommemorativeNftRouteDependencies {
  readonly createGenerationCoordinator?: (
    env: CommemorativeNftWorkerBindings,
  ) => GenerationCoordinator
  readonly createTokenOwnershipReader?: (
    env: CommemorativeNftWorkerBindings,
  ) => TokenOwnershipReader
}

const jsonResponse = (
  request: Request,
  body: Readonly<Record<string, string>>,
  status: number,
  extraHeaders?: HeadersInit,
): Response => {
  const headers = new Headers(extraHeaders)
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Type', 'application/json; charset=UTF-8')

  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    headers,
    status,
  })
}

const unavailableResponse = (
  request: Request,
  error = 'Asset is being prepared',
): Response =>
  jsonResponse(request, { error }, 503, {
    'Retry-After': RETRY_AFTER_SECONDS.toString(),
  })

const getCoordinatorStatus = async (
  coordinator: GenerationCoordinator,
  tokenId: string,
): Promise<GenerationPreparationStatus> => {
  try {
    return await coordinator.prepare(tokenId)
  } catch {
    return 'unavailable'
  }
}

const preparationResponse = (
  request: Request,
  status: GenerationPreparationStatus,
): Response => {
  if (status === 'preparing') {
    return jsonResponse(request, { status: 'preparing' }, 202, {
      'Retry-After': RETRY_AFTER_SECONDS.toString(),
    })
  }
  if (status === 'rate-limited') {
    return jsonResponse(
      request,
      { error: 'Asset preparation is rate limited' },
      429,
      {
        'Retry-After': GENERATION_RETRY_WINDOW_SECONDS.toString(),
      },
    )
  }

  return unavailableResponse(request, 'Asset generation is not configured')
}

const serveAssetOrPrepare = async (params: {
  readonly asset: TokenAsset
  readonly bucket: R2Bucket
  readonly coordinator: GenerationCoordinator
  readonly ownershipReader: TokenOwnershipReader
  readonly rendererRevision: string
  readonly request: Request
}): Promise<Response> => {
  if (!(await hasRenderInput(params.bucket, params.asset.tokenId))) {
    return jsonResponse(params.request, { error: 'Asset not found' }, 404)
  }

  const ownership = await params.ownershipReader.getStatus(params.asset.tokenId)
  if (ownership === 'unminted') {
    return jsonResponse(params.request, { error: 'Asset not found' }, 404)
  }
  if (ownership === 'unavailable') return unavailableResponse(params.request)

  const isComplete = await hasVerifiedTokenCompletion(
    params.bucket,
    params.asset.tokenId,
    params.rendererRevision,
  )
  const storedResponse = isComplete
    ? await getTokenAssetResponse(params.bucket, params.asset, params.request)
    : null
  if (storedResponse) return storedResponse

  await getCoordinatorStatus(params.coordinator, params.asset.tokenId)
  return unavailableResponse(params.request)
}

export const createCommemorativeNftApp = (
  dependencies: CommemorativeNftRouteDependencies = {},
) => {
  const createGenerationCoordinator =
    dependencies.createGenerationCoordinator ??
    ((env: CommemorativeNftWorkerBindings) =>
      createWorkflowGenerationCoordinator(
        isRemoteGeneratorConfigured(env)
          ? env.COMMEMORATIVE_NFT_GENERATION
          : undefined,
        createKvGenerationAdmission(env.KV),
      ))
  const createTokenOwnershipReader =
    dependencies.createTokenOwnershipReader ?? createSepoliaTokenOwnershipReader

  return createApp<'/', CommemorativeNftEnv>()
    .basePath('/v1/commemorative-nft')
    .on(['GET', 'HEAD'], '/:asset', async (c) => {
      const request = c.req.raw
      try {
        const asset = parseTokenAsset(c.req.param('asset'))
        if (!asset) {
          return jsonResponse(request, { error: 'Asset not found' }, 404)
        }

        const bucket = c.env.COMMEMORATIVE_NFT_BUCKET
        if (!bucket) {
          return unavailableResponse(request, 'Asset storage is not configured')
        }

        return await serveAssetOrPrepare({
          asset,
          bucket,
          coordinator: createGenerationCoordinator(c.env),
          ownershipReader: createTokenOwnershipReader(c.env),
          rendererRevision: c.env.COMMEMORATIVE_NFT_RENDERER_REVISION,
          request,
        })
      } catch {
        return unavailableResponse(
          request,
          'Asset lookup is temporarily unavailable',
        )
      }
    })
    .post('/:tokenId/prepare', async (c) => {
      const request = c.req.raw
      try {
        const tokenId = parseCanonicalTokenId(c.req.param('tokenId'))
        if (!tokenId) {
          return jsonResponse(request, { error: 'Asset not found' }, 404)
        }

        const bucket = c.env.COMMEMORATIVE_NFT_BUCKET
        if (!bucket) {
          return unavailableResponse(request, 'Asset storage is not configured')
        }

        if (!(await hasRenderInput(bucket, tokenId))) {
          return jsonResponse(request, { error: 'Asset not found' }, 404)
        }

        const ownership = await createTokenOwnershipReader(c.env).getStatus(
          tokenId,
        )
        if (ownership === 'unminted') {
          return jsonResponse(request, { error: 'Token is not minted' }, 409)
        }
        if (ownership === 'unavailable') {
          return unavailableResponse(request, 'Token ownership is unavailable')
        }

        if (
          await hasVerifiedTokenCompletion(
            bucket,
            tokenId,
            c.env.COMMEMORATIVE_NFT_RENDERER_REVISION,
          )
        ) {
          return jsonResponse(request, { status: 'ready' }, 200)
        }

        const preparationStatus = await getCoordinatorStatus(
          createGenerationCoordinator(c.env),
          tokenId,
        )
        return preparationResponse(request, preparationStatus)
      } catch {
        return unavailableResponse(
          request,
          'Asset preparation is temporarily unavailable',
        )
      }
    })
}

export default createCommemorativeNftApp()
