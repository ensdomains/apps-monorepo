import { AwsClient } from 'aws4fetch'
import { ImmutableArtifactConflictError } from './errors.js'
import { sha256Hex } from './media.js'
import { withRetry } from './retry.js'

export type PutObjectOptions = {
  readonly cacheControl?: string
  readonly contentType: string
  readonly customMetadata: Readonly<Record<string, string>>
}

export type StoredObject = {
  readonly contentType?: string
  readonly etag?: string
  readonly rendererRevision?: string
  readonly runtimeAdapter?: string
  readonly sha256?: string
  readonly size: number
}

export type ReadObject = StoredObject & {
  readonly body: Uint8Array
}

export type ObjectStore = {
  readonly getJson: (key: string) => Promise<unknown | undefined>
  readonly head: (key: string) => Promise<StoredObject | undefined>
  readonly read: (key: string) => Promise<ReadObject | undefined>
  readonly putImmutable: (
    key: string,
    value: Uint8Array | string,
    options: PutObjectOptions,
  ) => Promise<StoredObject>
}

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const R2_READ_ATTEMPTS = 3
const R2_REQUEST_TIMEOUT_MS = 10_000
const R2_WRITE_ATTEMPTS = 5
const RETRYABLE_R2_STATUSES = new Set([408, 425, 429])

type SignedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type R2ObjectStoreDependencies = {
  readonly requestTimeoutMs?: number
  readonly signedFetch?: SignedFetch
  readonly sleep?: (delayMs: number) => Promise<void>
}

const requireRetryableResponse = async (
  responsePromise: Promise<Response>,
  operation: string,
): Promise<Response> => {
  const response = await responsePromise
  if (RETRYABLE_R2_STATUSES.has(response.status) || response.status >= 500) {
    throw new Error(`${operation} failed with HTTP ${response.status}`)
  }
  return response
}

const encodeKey = (key: string): string =>
  key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

const responseObject = (response: Response): StoredObject => {
  const rawSize = response.headers.get('content-length')
  const size = rawSize ? Number(rawSize) : 0
  return {
    contentType: response.headers.get('content-type') ?? undefined,
    etag: response.headers.get('etag') ?? undefined,
    rendererRevision:
      response.headers.get('x-amz-meta-renderer-revision') ?? undefined,
    runtimeAdapter:
      response.headers.get('x-amz-meta-runtime-adapter') ?? undefined,
    sha256: response.headers.get('x-amz-meta-sha256') ?? undefined,
    size: Number.isSafeInteger(size) && size >= 0 ? size : 0,
  }
}

const requireMatchingImmutableObject = (params: {
  readonly expectedSha256: string
  readonly key: string
  readonly object: StoredObject | undefined
  readonly options: PutObjectOptions
}): StoredObject => {
  const expectedRendererRevision =
    params.options.customMetadata['renderer-revision']
  const expectedRuntimeAdapter =
    params.options.customMetadata['runtime-adapter']

  if (
    !params.object ||
    params.object.sha256 !== params.expectedSha256 ||
    params.object.contentType !== params.options.contentType ||
    params.object.rendererRevision !== expectedRendererRevision ||
    params.object.runtimeAdapter !== expectedRuntimeAdapter
  ) {
    throw new ImmutableArtifactConflictError(
      `Immutable R2 object ${params.key} does not match the requested content and runtime metadata`,
    )
  }

  return params.object
}

export class R2ObjectStore implements ObjectStore {
  readonly #bucketName: string
  readonly #origin: string
  readonly #requestTimeoutMs: number
  readonly #signedFetch: SignedFetch
  readonly #sleep?: (delayMs: number) => Promise<void>

  constructor(
    params: {
      readonly accessKeyId: string
      readonly accountId: string
      readonly bucketName: string
      readonly secretAccessKey: string
    },
    dependencies: R2ObjectStoreDependencies = {},
  ) {
    this.#bucketName = params.bucketName
    this.#origin = `https://${params.accountId}.r2.cloudflarestorage.com`
    const client = new AwsClient({
      accessKeyId: params.accessKeyId,
      retries: 0,
      secretAccessKey: params.secretAccessKey,
      region: 'auto',
      service: 's3',
    })
    this.#requestTimeoutMs =
      dependencies.requestTimeoutMs ?? R2_REQUEST_TIMEOUT_MS
    if (
      !Number.isSafeInteger(this.#requestTimeoutMs) ||
      this.#requestTimeoutMs <= 0
    ) {
      throw new Error('R2 request timeout must be a positive integer')
    }
    this.#signedFetch =
      dependencies.signedFetch ?? ((input, init) => client.fetch(input, init))
    this.#sleep = dependencies.sleep
  }

  #url(key: string): string {
    return `${this.#origin}/${this.#bucketName}/${encodeKey(key)}`
  }

  #fetch(key: string, init?: RequestInit): Promise<Response> {
    return this.#signedFetch(this.#url(key), {
      ...init,
      signal: AbortSignal.timeout(this.#requestTimeoutMs),
    })
  }

  #retryOptions(attempts: number, baseDelayMs: number) {
    return {
      attempts,
      baseDelayMs,
      ...(this.#sleep ? { sleep: this.#sleep } : {}),
    }
  }

  async head(key: string): Promise<StoredObject | undefined> {
    const response = await withRetry(
      () =>
        requireRetryableResponse(
          this.#fetch(key, { method: 'HEAD' }),
          `R2 HEAD ${key}`,
        ),
      this.#retryOptions(R2_READ_ATTEMPTS, 250),
    )
    if (response.status === 404) return undefined
    if (!response.ok) {
      throw new Error(`R2 HEAD ${key} failed with HTTP ${response.status}`)
    }
    return responseObject(response)
  }

  async getJson(key: string): Promise<unknown | undefined> {
    const response = await withRetry(
      () => requireRetryableResponse(this.#fetch(key), `R2 GET ${key}`),
      this.#retryOptions(R2_READ_ATTEMPTS, 250),
    )
    if (response.status === 404) return undefined
    if (!response.ok) {
      throw new Error(`R2 GET ${key} failed with HTTP ${response.status}`)
    }
    return response.json()
  }

  async read(key: string): Promise<ReadObject | undefined> {
    const response = await withRetry(
      () => requireRetryableResponse(this.#fetch(key), `R2 GET ${key}`),
      this.#retryOptions(R2_READ_ATTEMPTS, 250),
    )
    if (response.status === 404) return undefined
    if (!response.ok) {
      throw new Error(`R2 GET ${key} failed with HTTP ${response.status}`)
    }

    const body = new Uint8Array(await response.arrayBuffer())
    return {
      ...responseObject(response),
      body,
      size: body.byteLength,
    }
  }

  async putImmutable(
    key: string,
    value: Uint8Array | string,
    options: PutObjectOptions,
  ): Promise<StoredObject> {
    const sha256 = sha256Hex(value)
    const existing = await this.head(key)
    if (existing) {
      return requireMatchingImmutableObject({
        expectedSha256: sha256,
        key,
        object: existing,
        options,
      })
    }

    const body =
      typeof value === 'string' ? value : Uint8Array.from(value).buffer
    const response = await withRetry(
      () =>
        requireRetryableResponse(
          this.#fetch(key, {
            method: 'PUT',
            body,
            headers: {
              'Cache-Control': options.cacheControl ?? IMMUTABLE_CACHE_CONTROL,
              'Content-Type': options.contentType,
              'If-None-Match': '*',
              'x-amz-meta-sha256': sha256,
              ...Object.fromEntries(
                Object.entries(options.customMetadata).map(([name, value]) => [
                  `x-amz-meta-${name}`,
                  value,
                ]),
              ),
            },
          }),
          `R2 PUT ${key}`,
        ),
      {
        ...this.#retryOptions(R2_WRITE_ATTEMPTS, 500),
        isRetryable: (error) =>
          !(error instanceof ImmutableArtifactConflictError),
      },
    )

    if (response.status === 412) {
      const racedObject = await this.head(key)
      return requireMatchingImmutableObject({
        expectedSha256: sha256,
        key,
        object: racedObject,
        options,
      })
    }
    if (!response.ok) {
      throw new Error(`R2 PUT ${key} failed with HTTP ${response.status}`)
    }

    const stored = await this.head(key)
    return requireMatchingImmutableObject({
      expectedSha256: sha256,
      key,
      object: stored,
      options,
    })
  }
}
