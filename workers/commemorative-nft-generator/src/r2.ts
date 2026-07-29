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
const R2_WRITE_ATTEMPTS = 5

const requireNonRetryableResponse = async (
  responsePromise: Promise<Response>,
  operation: string,
): Promise<Response> => {
  const response = await responsePromise
  if (response.status === 429 || response.status >= 500) {
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

export class R2ObjectStore implements ObjectStore {
  readonly #bucketName: string
  readonly #client: AwsClient
  readonly #origin: string

  constructor(params: {
    readonly accessKeyId: string
    readonly accountId: string
    readonly bucketName: string
    readonly secretAccessKey: string
  }) {
    this.#bucketName = params.bucketName
    this.#origin = `https://${params.accountId}.r2.cloudflarestorage.com`
    this.#client = new AwsClient({
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
      region: 'auto',
      service: 's3',
    })
  }

  #url(key: string): string {
    return `${this.#origin}/${this.#bucketName}/${encodeKey(key)}`
  }

  async head(key: string): Promise<StoredObject | undefined> {
    const response = await withRetry(
      () =>
        requireNonRetryableResponse(
          this.#client.fetch(this.#url(key), { method: 'HEAD' }),
          `R2 HEAD ${key}`,
        ),
      { attempts: 3, baseDelayMs: 250 },
    )
    if (response.status === 404) return undefined
    if (!response.ok) {
      throw new Error(`R2 HEAD ${key} failed with HTTP ${response.status}`)
    }
    return responseObject(response)
  }

  async getJson(key: string): Promise<unknown | undefined> {
    const response = await withRetry(
      () =>
        requireNonRetryableResponse(
          this.#client.fetch(this.#url(key)),
          `R2 GET ${key}`,
        ),
      { attempts: 3, baseDelayMs: 250 },
    )
    if (response.status === 404) return undefined
    if (!response.ok) {
      throw new Error(`R2 GET ${key} failed with HTTP ${response.status}`)
    }
    return response.json()
  }

  async read(key: string): Promise<ReadObject | undefined> {
    const response = await withRetry(
      () =>
        requireNonRetryableResponse(
          this.#client.fetch(this.#url(key)),
          `R2 GET ${key}`,
        ),
      { attempts: 3, baseDelayMs: 250 },
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
      if (existing.sha256 === sha256) return existing
      throw new ImmutableArtifactConflictError(
        `Refusing to overwrite immutable R2 object ${key}`,
      )
    }

    const body =
      typeof value === 'string' ? value : Uint8Array.from(value).buffer
    const response = await withRetry(
      () =>
        requireNonRetryableResponse(
          this.#client.fetch(this.#url(key), {
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
        attempts: R2_WRITE_ATTEMPTS,
        baseDelayMs: 500,
        isRetryable: (error) =>
          !(error instanceof ImmutableArtifactConflictError),
      },
    )

    if (response.status === 412) {
      const racedObject = await this.head(key)
      if (racedObject?.sha256 === sha256) return racedObject
      throw new ImmutableArtifactConflictError(
        `Concurrent immutable R2 write conflicted for ${key}`,
      )
    }
    if (!response.ok) {
      throw new Error(`R2 PUT ${key} failed with HTTP ${response.status}`)
    }

    const stored = await this.head(key)
    if (!stored || stored.sha256 !== sha256) {
      throw new Error(`R2 verification failed after writing ${key}`)
    }
    return stored
  }
}
