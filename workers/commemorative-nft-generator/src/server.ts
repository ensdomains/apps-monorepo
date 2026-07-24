import { timingSafeEqual } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { RendererMediaCapture } from './capture.js'
import { loadGeneratorConfig } from './config.js'
import { R2ObjectStore } from './r2.js'
import { TokenGenerationService } from './service.js'

const json = (
  response: ServerResponse,
  status: number,
  body: Readonly<Record<string, unknown>>,
): void => {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
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
const capture = new RendererMediaCapture({
  rendererOrigin: config.rendererOrigin,
  captureTimeoutMs: config.captureTimeoutMs,
  chromiumExecutablePath: config.chromiumExecutablePath,
})
const service = new TokenGenerationService({
  store,
  capture,
  externalOrigin: config.externalOrigin,
  publicAssetOrigin: config.publicAssetOrigin,
  publicR2Origin: config.publicR2Origin,
})

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://generator.internal')
    if (request.method === 'GET' && url.pathname === '/healthz') {
      json(response, 200, { status: 'ok' })
      return
    }

    const match = /^\/v1\/tokens\/([^/]+)\/prepare$/.exec(url.pathname)
    if (request.method !== 'POST' || !match) {
      json(response, 404, { error: 'Not found' })
      return
    }
    if (!authorized(request, config.authToken)) {
      json(response, 401, { error: 'Unauthorized' })
      return
    }

    const result = await service.prepare(match[1])
    json(response, result.status === 'already-generated' ? 200 : 202, result)
  } catch (error) {
    console.error('Generator request failed', error)
    json(response, 400, { error: 'Invalid generation request' })
  }
})

server.listen(config.port, () => {
  console.log(`Commemorative NFT generator listening on :${config.port}`)
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
