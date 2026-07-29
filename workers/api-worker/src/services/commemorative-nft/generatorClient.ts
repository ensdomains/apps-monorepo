import { getContainer } from '@cloudflare/containers'
import type {
  CommemorativeNftGeneratorBindings,
  CommemorativeNftGeneratorContainer,
} from './container.js'

export const GENERATOR_ACTIONS = ['capture', 'publish', 'verify'] as const
export type GeneratorAction = (typeof GENERATOR_ACTIONS)[number]

export type GeneratorArtifactRecord = {
  readonly contentType: string
  readonly key: string
  readonly sha256: string
  readonly size: number
}

export type GeneratorResponse = {
  readonly artifacts: readonly GeneratorArtifactRecord[]
  readonly rendererRevision: string
  readonly runtimeAdapter: 'container'
  readonly tokenId: string
}

const expectedArtifactContentTypes = {
  json: 'application/json; charset=utf-8',
  mp4: 'video/mp4',
  png: 'image/png',
} as const

export class GeneratorRequestError extends Error {
  override readonly name = 'GeneratorRequestError'
  readonly isRetryable: boolean

  constructor(message: string, isRetryable: boolean) {
    super(message)
    this.isRetryable = isRetryable
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseGeneratorResponse = (value: unknown): GeneratorResponse => {
  if (
    !isRecord(value) ||
    typeof value.tokenId !== 'string' ||
    value.runtimeAdapter !== 'container' ||
    typeof value.rendererRevision !== 'string' ||
    !Array.isArray(value.artifacts)
  ) {
    throw new GeneratorRequestError(
      'Generator returned an unsupported response',
      false,
    )
  }

  const artifacts = value.artifacts.map((artifact) => {
    if (
      !isRecord(artifact) ||
      typeof artifact.key !== 'string' ||
      typeof artifact.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
      typeof artifact.size !== 'number' ||
      !Number.isSafeInteger(artifact.size) ||
      artifact.size <= 0 ||
      typeof artifact.contentType !== 'string'
    ) {
      throw new GeneratorRequestError(
        'Generator returned an invalid artifact record',
        false,
      )
    }

    return {
      contentType: artifact.contentType,
      key: artifact.key,
      sha256: artifact.sha256,
      size: artifact.size,
    }
  })

  return {
    artifacts,
    rendererRevision: value.rendererRevision,
    runtimeAdapter: value.runtimeAdapter,
    tokenId: value.tokenId,
  }
}

export const validateGeneratorResponseForAction = (
  response: GeneratorResponse,
  tokenId: string,
  action: GeneratorAction,
  rendererRevision: string,
): GeneratorResponse => {
  if (response.tokenId !== tokenId) {
    throw new GeneratorRequestError(
      `Generator returned token ${response.tokenId} for request ${tokenId}`,
      false,
    )
  }
  if (response.rendererRevision !== rendererRevision) {
    throw new GeneratorRequestError(
      `Generator returned renderer revision ${response.rendererRevision}; expected ${rendererRevision}`,
      false,
    )
  }

  const expectedExtensions =
    action === 'capture'
      ? (['mp4', 'png'] as const)
      : (['json', 'mp4', 'png'] as const)
  const expectedArtifacts = new Map(
    expectedExtensions.map((extension) => [
      `tokens/${tokenId}.${extension}`,
      expectedArtifactContentTypes[extension],
    ]),
  )

  if (
    response.artifacts.length !== expectedArtifacts.size ||
    new Set(response.artifacts.map(({ key }) => key)).size !==
      response.artifacts.length
  ) {
    throw new GeneratorRequestError(
      `Generator returned an incomplete ${action} artifact set`,
      false,
    )
  }

  for (const artifact of response.artifacts) {
    const expectedContentType = expectedArtifacts.get(artifact.key)
    if (!expectedContentType || artifact.contentType !== expectedContentType) {
      throw new GeneratorRequestError(
        `Generator returned an unexpected ${action} artifact`,
        false,
      )
    }
  }

  return response
}

const parseGeneratorError = async (response: Response): Promise<string> => {
  try {
    const value: unknown = await response.json()
    if (isRecord(value) && typeof value.error === 'string') return value.error
  } catch {
    // The HTTP status remains useful when the container returned no JSON.
  }
  return `Generator returned HTTP ${response.status}`
}

const getGeneratorSlot = (tokenId: string): string =>
  `commemorative-nft-generator-${BigInt(tokenId) % 2n}`

export const callContainerGenerator = async (
  env: CommemorativeNftGeneratorBindings,
  tokenId: string,
  action: GeneratorAction,
): Promise<GeneratorResponse> => {
  const container = getContainer<CommemorativeNftGeneratorContainer>(
    env.COMMEMORATIVE_NFT_GENERATOR,
    getGeneratorSlot(tokenId),
  )
  const response = await container.fetch(
    new Request(
      `http://commemorative-nft-generator.internal/v1/tokens/${tokenId}/${action}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN}`,
        },
        signal: AbortSignal.timeout(600_000),
      },
    ),
  )

  if (!response.ok) {
    throw new GeneratorRequestError(
      await parseGeneratorError(response),
      response.status !== 401 &&
        response.status !== 409 &&
        response.status !== 422,
    )
  }

  return validateGeneratorResponseForAction(
    parseGeneratorResponse(await response.json()),
    tokenId,
    action,
    env.COMMEMORATIVE_NFT_RENDERER_REVISION,
  )
}
