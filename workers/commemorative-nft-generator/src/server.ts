import { timingSafeEqual } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { CaptureAdmission } from './admission.js'
import { createCachedBrowserReadinessProbe } from './browserReadiness.js'
import { createLocalBrowserFactory, RendererMediaCapture } from './capture.js'
import { loadGeneratorConfig } from './config.js'
import { isNonRetryableGeneratorError } from './errors.js'
import { R2ObjectStore } from './r2.js'
import { TokenGenerationService } from './service.js'

const json = (
  response: ServerResponse,
  status: number,
  body: Readonly<Record<string, unknown>>,
  extraHeaders?: Readonly<Record<string, string>>,
): void => {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  })
  response.end(JSON.stringify(body))
}

const authorized = (
  request: IncomingMessage,
  expectedToken: string,
): boolean => {
  const value = request.headers.authorization
  if (!value?.startsWith('Bearer ')) return false

  const actual = Buffer.from(value.slice('Bearer '.length))
  const expected = Buffer.from(expectedToken)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const config = loadGeneratorConfig()
const store = new R2ObjectStore({
  accountId: config.r2AccountId,
  accessKeyId: config.r2AccessKeyId,
  secretAccessKey: config.r2SecretAccessKey,
  bucketName: config.r2BucketName,
})
const browserFactory = createLocalBrowserFactory({
  executablePath: config.chromiumExecutablePath,
  extraArgs: config.chromiumExtraArgs,
  graphicsMode: config.chromiumGraphicsMode,
})
const captureAdmission = new CaptureAdmission()
const probeBrowserReadiness = createCachedBrowserReadinessProbe({
  browserFactory,
  cacheMs: 10 * 60_000,
  configuredMode: config.chromiumGraphicsMode,
})
const capture = new RendererMediaCapture({
  browserFactory,
  graphicsRequirement: config.chromiumGraphicsMode,
  rendererOrigin: config.rendererOrigin,
  rendererRevision: config.rendererRevision,
  captureTimeoutMs: config.captureTimeoutMs,
})
const service = new TokenGenerationService({
  store,
  capture,
  externalOrigin: config.externalOrigin,
  publicAssetOrigin: config.publicAssetOrigin,
  publicR2Origin: config.publicR2Origin,
  rendererRevision: config.rendererRevision,
  runtimeAdapter: config.runtimeAdapter,
})
type GenerationRoute = {
  readonly action: 'capture' | 'publish' | 'verify'
  readonly tokenId: string
}

const getGenerationRoute = (
  request: IncomingMessage,
  pathname: string,
): GenerationRoute | undefined => {
  if (request.method !== 'POST') return undefined
  const match = /^\/v1\/tokens\/([^/]+)\/(capture|publish|verify)$/.exec(
    pathname,
  )
  if (!match) return undefined

  return {
    action: match[2] as GenerationRoute['action'],
    tokenId: match[1],
  }
}

const executeGenerationAction = ({ action, tokenId }: GenerationRoute) => {
  if (action === 'capture') return service.captureAndPersistMedia(tokenId)
  if (action === 'publish') return service.publishMetadata(tokenId)
  return service.verifyArtifacts(tokenId)
}

const handleGenerationRequest = async (
  route: GenerationRoute,
  response: ServerResponse,
): Promise<void> => {
  const releaseCapture =
    route.action === 'capture' ? captureAdmission.acquire() : undefined
  if (route.action === 'capture' && !releaseCapture) {
    json(
      response,
      429,
      {
        error: 'This generator instance is already capturing',
        retryable: true,
      },
      { 'Retry-After': '15' },
    )
    return
  }

  try {
    json(response, 200, await executeGenerationAction(route))
  } catch (error) {
    console.error('Commemorative NFT generator request failed', {
      action: route.action,
      error,
      tokenId: route.tokenId,
    })
    json(response, isNonRetryableGeneratorError(error) ? 422 : 503, {
      error: error instanceof Error ? error.message : 'Generation failed',
      retryable: !isNonRetryableGeneratorError(error),
    })
  } finally {
    releaseCapture?.()
  }
}

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const url = new URL(request.url || '/', 'http://generator.internal')
  if (request.method === 'GET' && url.pathname === '/livez') {
    json(response, 200, { status: 'ok' })
    return
  }

  if (request.method === 'GET' && url.pathname === '/healthz') {
    const releaseReadiness = captureAdmission.acquire()
    if (!releaseReadiness) {
      json(response, 503, { status: 'busy' }, { 'Retry-After': '15' })
      return
    }
    try {
      const readiness = await probeBrowserReadiness()
      json(response, readiness.ready ? 200 : 503, {
        browserVersion: readiness.browserVersion,
        encoder: readiness.encoder,
        graphics: readiness.graphics,
        rendererRevision: config.rendererRevision,
        runtimeAdapter: config.runtimeAdapter,
        status: readiness.ready ? 'ok' : 'not_ready',
      })
    } finally {
      releaseReadiness()
    }
    return
  }

  if (!authorized(request, config.authToken)) {
    json(response, 401, { error: 'Unauthorized' })
    return
  }

  const route = getGenerationRoute(request, url.pathname)
  if (!route) {
    json(response, 404, { error: 'Not found' })
    return
  }

  await handleGenerationRequest(route, response)
}

const server = createServer(handleRequest)

server.listen(config.port, () => {
  console.log(`Commemorative NFT generator listening on :${config.port}`, {
    chromiumGraphicsMode: config.chromiumGraphicsMode,
    runtimeAdapter: config.runtimeAdapter,
  })
})

const shutdown = (): void => {
  server.close((error) => {
    if (error) {
      console.error('Failed to close generator server', error)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
