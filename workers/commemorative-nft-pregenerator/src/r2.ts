import { AwsClient } from 'aws4fetch'
import { sha256Hex } from './media.js'
import { type RetryOptions, withRetry } from './retry.js'

export class ImmutableObjectConflictError extends Error {
  override readonly name = 'ImmutableObjectConflictError'
}

export class R2WritesDisabledError extends Error {
  override readonly name = 'R2WritesDisabledError'
}

export class R2RequestError extends Error {
  override readonly name = 'R2RequestError'
  readonly status?: number

  constructor(
    message: string,
    options?: { readonly cause?: unknown; readonly status?: number },
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause },
    )
    this.status = options?.status
  }
}

export type StoredObject = {
  readonly cacheControl?: string
  readonly contentType?: string
  readonly etag?: string
  readonly metadata: Readonly<Record<string, string>>
  readonly sha256?: string
  readonly size: number
}

export type PutImmutableOptions = {
  readonly cacheControl?: string
  readonly contentType: string
  readonly metadata?: Readonly<Record<string, string>>
}

export type PutImmutableResult = StoredObject & {
  readonly disposition: 'existing' | 'uploaded'
  readonly key: string
}

export type ObjectStore = {
  readonly head: (key: string) => Promise<StoredObject | undefined>
  readonly putImmutable: (
    key: string,
    value: Uint8Array | string,
    options: PutImmutableOptions,
  ) => Promise<PutImmutableResult>
}

type SignedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type R2ObjectStoreDependencies = {
  readonly requestTimeoutMs?: number
  readonly signedFetch?: SignedFetch
  readonly sleep?: RetryOptions['sleep']
}

export type R2ObjectStoreConfig = {
  readonly accessKeyId: string
  readonly accountId: string
  readonly bucketName: string
  readonly secretAccessKey: string
  readonly writeEnabled: boolean
}

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const R2_LIST_MAX_PAGES = 1_000
const R2_READ_ATTEMPTS = 3
const R2_REQUEST_TIMEOUT_MS = 10_000
const R2_WRITE_ATTEMPTS = 5
const TRANSIENT_R2_STATUSES = new Set([408, 409, 425, 429])
const METADATA_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/

const isTransientStatus = (status: number | undefined): boolean =>
  status === undefined ||
  TRANSIENT_R2_STATUSES.has(status) ||
  (status >= 500 && status <= 599)

const isRetryableR2Error = (error: unknown): boolean => {
  if (
    error instanceof ImmutableObjectConflictError ||
    error instanceof R2WritesDisabledError
  ) {
    return false
  }
  if (error instanceof R2RequestError) return isTransientStatus(error.status)
  return true
}

const encodeKey = (key: string): string =>
  key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

const decodeXmlText = (value: string): string =>
  value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

const xmlValues = (xml: string, tag: string): readonly string[] => {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  return [...xml.matchAll(pattern)].map((match) =>
    decodeXmlText(match[1] ?? ''),
  )
}

type ListObjectsPage = {
  readonly encodedKeys: readonly string[]
  readonly isTruncated: boolean
  readonly nextContinuationToken?: string
}

const parseListObjectsPage = (xml: string): ListObjectsPage => {
  const hasValidRoot =
    /^(?:<\?xml[^>]*>\s*)?<ListBucketResult(?:\s[^>]*)?>[\s\S]*<\/ListBucketResult>\s*$/.test(
      xml.trim(),
    )
  const encodingTypes = xmlValues(xml, 'EncodingType')
  const truncationValues = xmlValues(xml, 'IsTruncated')
  const keyCountValues = xmlValues(xml, 'KeyCount')
  if (
    !hasValidRoot ||
    encodingTypes.length !== 1 ||
    encodingTypes[0] !== 'url' ||
    truncationValues.length !== 1 ||
    !['true', 'false'].includes(truncationValues[0] ?? '') ||
    keyCountValues.length !== 1 ||
    !/^\d+$/.test(keyCountValues[0] ?? '')
  ) {
    throw new R2RequestError('R2 LIST returned malformed XML')
  }

  const encodedKeys = xmlValues(xml, 'Key')
  const keyCount = Number(keyCountValues[0])
  if (!Number.isSafeInteger(keyCount) || keyCount !== encodedKeys.length) {
    throw new R2RequestError('R2 LIST returned an inconsistent key count')
  }

  const isTruncated = truncationValues[0] === 'true'
  const continuationTokens = xmlValues(xml, 'NextContinuationToken')
  if (
    (isTruncated && continuationTokens.length !== 1) ||
    (!isTruncated && continuationTokens.length !== 0)
  ) {
    throw new R2RequestError(
      'R2 LIST returned inconsistent pagination metadata',
    )
  }

  return {
    encodedKeys,
    isTruncated,
    ...(continuationTokens[0]
      ? { nextContinuationToken: continuationTokens[0] }
      : {}),
  }
}

const readMetadata = (headers: Headers): Readonly<Record<string, string>> => {
  const metadata: Record<string, string> = {}
  for (const [name, value] of headers.entries()) {
    if (name.startsWith('x-amz-meta-')) {
      metadata[name.slice('x-amz-meta-'.length)] = value
    }
  }
  return metadata
}

const storedObjectFromResponse = (response: Response): StoredObject => {
  const rawSize = response.headers.get('content-length')
  const parsedSize = rawSize === null ? 0 : Number(rawSize)
  const metadata = readMetadata(response.headers)

  return {
    cacheControl: response.headers.get('cache-control') ?? undefined,
    contentType: response.headers.get('content-type') ?? undefined,
    etag: response.headers.get('etag') ?? undefined,
    metadata,
    sha256: metadata.sha256,
    size: Number.isSafeInteger(parsedSize) && parsedSize >= 0 ? parsedSize : 0,
  }
}

const normalizedMetadata = (
  metadata: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {}
  for (const [rawName, value] of Object.entries(metadata ?? {})) {
    const name = rawName.toLowerCase()
    if (!METADATA_NAME_PATTERN.test(name) || name === 'sha256') {
      throw new Error(`Invalid or reserved R2 metadata name: ${rawName}`)
    }
    if (/\r|\n/.test(value)) {
      throw new Error(`R2 metadata ${rawName} contains a line break`)
    }
    result[name] = value
  }
  return result
}

const requireMatchingObject = (params: {
  readonly cacheControl: string
  readonly contentType: string
  readonly expectedMetadata: Readonly<Record<string, string>>
  readonly key: string
  readonly object: StoredObject | undefined
  readonly sha256: string
  readonly size: number
}): StoredObject => {
  const object = params.object
  const hasMatchingMetadata = Object.entries(params.expectedMetadata).every(
    ([name, value]) => object?.metadata[name] === value,
  )
  if (
    !object ||
    object.sha256 !== params.sha256 ||
    object.size !== params.size ||
    object.contentType !== params.contentType ||
    object.cacheControl !== params.cacheControl ||
    !hasMatchingMetadata
  ) {
    throw new ImmutableObjectConflictError(
      `Immutable R2 object ${params.key} does not match the requested artifact`,
    )
  }
  return object
}

export class R2ObjectStore implements ObjectStore {
  readonly #origin: string
  readonly #requestTimeoutMs: number
  readonly #signedFetch: SignedFetch
  readonly #sleep?: RetryOptions['sleep']
  readonly #writeEnabled: boolean

  constructor(
    config: R2ObjectStoreConfig,
    dependencies: R2ObjectStoreDependencies = {},
  ) {
    const client = new AwsClient({
      accessKeyId: config.accessKeyId,
      retries: 0,
      secretAccessKey: config.secretAccessKey,
      region: 'auto',
      service: 's3',
    })
    this.#origin = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}`
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
    this.#writeEnabled = config.writeEnabled
  }

  #url(key: string): string {
    if (key.length === 0) throw new Error('R2 object key cannot be empty')
    return `${this.#origin}/${encodeKey(key)}`
  }

  #fetchUrl(url: string, init?: RequestInit): Promise<Response> {
    return this.#signedFetch(url, {
      ...init,
      signal: AbortSignal.timeout(this.#requestTimeoutMs),
    })
  }

  #retryOptions(attempts: number, baseDelayMs: number): RetryOptions {
    return {
      attempts,
      baseDelayMs,
      isRetryable: isRetryableR2Error,
      ...(this.#sleep ? { sleep: this.#sleep } : {}),
    }
  }

  async #request(
    key: string,
    operation: string,
    init: RequestInit | undefined,
    attempts: number,
    baseDelayMs: number,
  ): Promise<Response> {
    return this.#requestUrl(
      this.#url(key),
      operation,
      init,
      attempts,
      baseDelayMs,
    )
  }

  async #requestUrl(
    url: string,
    operation: string,
    init: RequestInit | undefined,
    attempts: number,
    baseDelayMs: number,
  ): Promise<Response> {
    return withRetry(
      async () => {
        const response = await this.#fetchUrl(url, init)
        if (isTransientStatus(response.status)) {
          throw new R2RequestError(
            `${operation} failed with HTTP ${response.status}`,
            { status: response.status },
          )
        }
        return response
      },
      this.#retryOptions(attempts, baseDelayMs),
    )
  }

  async listKeys(): Promise<readonly string[]> {
    const keys: string[] = []
    let continuationToken: string | undefined

    for (let page = 0; page < R2_LIST_MAX_PAGES; page += 1) {
      const url = new URL(this.#origin)
      url.searchParams.set('list-type', '2')
      url.searchParams.set('encoding-type', 'url')
      url.searchParams.set('max-keys', '1000')
      if (continuationToken) {
        url.searchParams.set('continuation-token', continuationToken)
      }

      const response = await this.#requestUrl(
        url.toString(),
        'R2 LIST',
        { method: 'GET' },
        R2_READ_ATTEMPTS,
        250,
      )
      if (!response.ok) {
        throw new R2RequestError(
          `R2 LIST failed with HTTP ${response.status}`,
          { status: response.status },
        )
      }

      const listPage = parseListObjectsPage(await response.text())
      for (const encodedKey of listPage.encodedKeys) {
        try {
          keys.push(decodeURIComponent(encodedKey))
        } catch (error) {
          throw new R2RequestError('R2 LIST returned an invalid encoded key', {
            status: response.status,
            cause: error,
          })
        }
      }

      if (!listPage.isTruncated) {
        return keys.sort((left, right) => left.localeCompare(right, 'en-US'))
      }
      const nextContinuationToken = listPage.nextContinuationToken
      if (
        !nextContinuationToken ||
        nextContinuationToken === continuationToken
      ) {
        throw new R2RequestError('R2 LIST pagination did not advance')
      }
      continuationToken = nextContinuationToken
    }

    throw new R2RequestError(`R2 LIST exceeded ${R2_LIST_MAX_PAGES} pages`)
  }

  async head(key: string): Promise<StoredObject | undefined> {
    const response = await this.#request(
      key,
      `R2 HEAD ${key}`,
      { method: 'HEAD' },
      R2_READ_ATTEMPTS,
      250,
    )
    if (response.status === 404) return undefined
    if (!response.ok) {
      throw new R2RequestError(
        `R2 HEAD ${key} failed with HTTP ${response.status}`,
        { status: response.status },
      )
    }
    return storedObjectFromResponse(response)
  }

  async putImmutable(
    key: string,
    value: Uint8Array | string,
    options: PutImmutableOptions,
  ): Promise<PutImmutableResult> {
    if (!this.#writeEnabled) {
      throw new R2WritesDisabledError(
        'R2 writes are disabled; the caller must explicitly opt in',
      )
    }

    const size =
      typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength
    if (size === 0) throw new Error(`Refusing to upload empty R2 object ${key}`)

    const sha256 = sha256Hex(value)
    const cacheControl = options.cacheControl ?? IMMUTABLE_CACHE_CONTROL
    const metadata = normalizedMetadata(options.metadata)
    const expectedMetadata = { ...metadata, sha256 }
    const matchParams = {
      cacheControl,
      contentType: options.contentType,
      expectedMetadata,
      key,
      sha256,
      size,
    }

    const existing = await this.head(key)
    if (existing) {
      return {
        ...requireMatchingObject({ ...matchParams, object: existing }),
        disposition: 'existing',
        key,
      }
    }

    const body =
      typeof value === 'string' ? value : Uint8Array.from(value).buffer
    const response = await this.#request(
      key,
      `R2 PUT ${key}`,
      {
        body,
        headers: {
          'Cache-Control': cacheControl,
          'Content-Type': options.contentType,
          'If-None-Match': '*',
          ...Object.fromEntries(
            Object.entries(expectedMetadata).map(([name, metadataValue]) => [
              `x-amz-meta-${name}`,
              metadataValue,
            ]),
          ),
        },
        method: 'PUT',
      },
      R2_WRITE_ATTEMPTS,
      500,
    )

    if (response.status === 412) {
      const racedObject = await this.head(key)
      return {
        ...requireMatchingObject({ ...matchParams, object: racedObject }),
        disposition: 'existing',
        key,
      }
    }
    if (!response.ok) {
      throw new R2RequestError(
        `R2 PUT ${key} failed with HTTP ${response.status}`,
        { status: response.status },
      )
    }

    const stored = await this.head(key)
    return {
      ...requireMatchingObject({ ...matchParams, object: stored }),
      disposition: 'uploaded',
      key,
    }
  }
}
