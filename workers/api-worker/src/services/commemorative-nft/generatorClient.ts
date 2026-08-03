export const GENERATOR_ACTIONS = ['capture', 'publish', 'verify'] as const
export type GeneratorAction = (typeof GENERATOR_ACTIONS)[number]

export const GENERATOR_RUNTIME_ADAPTERS = ['ec2-nvidia'] as const
export type GeneratorRuntimeAdapter =
  (typeof GENERATOR_RUNTIME_ADAPTERS)[number]

export interface GeneratorClientBindings {
  readonly COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN: string
  readonly COMMEMORATIVE_NFT_GENERATOR_ORIGIN: string
  readonly COMMEMORATIVE_NFT_RENDERER_REVISION: string
}

export type GeneratorArtifactRecord = {
  readonly contentType: string
  readonly key: string
  readonly sha256: string
  readonly size: number
}

export type GeneratorResponse = {
  readonly artifacts: readonly GeneratorArtifactRecord[]
  readonly rendererRevision: string
  readonly runtimeAdapter: GeneratorRuntimeAdapter
  readonly tokenId: string
}

const expectedArtifactContentTypes = {
  json: 'application/json; charset=utf-8',
  mp4: 'video/mp4',
  png: 'image/png',
} as const

const actionTimeouts: Readonly<Record<GeneratorAction, number>> = {
  capture: 600_000,
  publish: 120_000,
  verify: 120_000,
}

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

const isGeneratorRuntimeAdapter = (
  value: unknown,
): value is GeneratorRuntimeAdapter =>
  typeof value === 'string' &&
  GENERATOR_RUNTIME_ADAPTERS.includes(value as GeneratorRuntimeAdapter)

const parseGeneratorResponse = (value: unknown): GeneratorResponse => {
  if (
    !isRecord(value) ||
    typeof value.tokenId !== 'string' ||
    !isGeneratorRuntimeAdapter(value.runtimeAdapter) ||
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
    // The HTTP status remains useful when the generator returned no JSON.
  }
  return `Generator returned HTTP ${response.status}`
}

export const isRetryableGeneratorStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500

const getGeneratorEndpoint = (
  configuredOrigin: string,
  tokenId: string,
  action: GeneratorAction,
): URL => {
  let origin: URL
  try {
    origin = new URL(configuredOrigin)
  } catch {
    throw new GeneratorRequestError(
      'Generator origin is not a valid URL',
      false,
    )
  }

  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new GeneratorRequestError(
      'Generator origin must be an HTTPS origin without credentials, a path, query, or fragment',
      false,
    )
  }

  return new URL(`/v1/tokens/${tokenId}/${action}`, origin)
}

export const isRemoteGeneratorConfigured = (
  env: Partial<
    Pick<
      GeneratorClientBindings,
      | 'COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN'
      | 'COMMEMORATIVE_NFT_GENERATOR_ORIGIN'
    >
  >,
): boolean => {
  if (!env.COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN?.trim()) return false

  try {
    getGeneratorEndpoint(
      env.COMMEMORATIVE_NFT_GENERATOR_ORIGIN ?? '',
      '0',
      'capture',
    )
    return true
  } catch {
    return false
  }
}

export const callRemoteGenerator = async (
  env: GeneratorClientBindings,
  tokenId: string,
  action: GeneratorAction,
  request: typeof fetch = fetch,
): Promise<GeneratorResponse> => {
  if (!env.COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN.trim()) {
    throw new GeneratorRequestError(
      'Generator authentication token is not configured',
      false,
    )
  }

  const endpoint = getGeneratorEndpoint(
    env.COMMEMORATIVE_NFT_GENERATOR_ORIGIN,
    tokenId,
    action,
  )
  let response: Response
  try {
    response = await request(endpoint.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN}`,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(actionTimeouts[action]),
    })
  } catch (error) {
    throw new GeneratorRequestError(
      error instanceof Error
        ? `Generator request failed: ${error.message}`
        : 'Generator request failed',
      true,
    )
  }

  if (!response.ok) {
    throw new GeneratorRequestError(
      await parseGeneratorError(response),
      isRetryableGeneratorStatus(response.status),
    )
  }

  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new GeneratorRequestError(
      'Generator returned invalid response JSON',
      false,
    )
  }

  return validateGeneratorResponseForAction(
    parseGeneratorResponse(value),
    tokenId,
    action,
    env.COMMEMORATIVE_NFT_RENDERER_REVISION,
  )
}
