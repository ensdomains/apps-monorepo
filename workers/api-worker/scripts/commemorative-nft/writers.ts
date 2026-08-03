import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { AwsClient } from 'aws4fetch'
import type { ArtifactWriter } from './types'

const DEFAULT_R2_MAX_ATTEMPTS = 5
const DEFAULT_R2_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_RETRY_DELAY_MS = 250
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429])
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/i
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/

type SignedFetch = (
  input: Request | string | URL,
  init?: RequestInit,
) => Promise<Response>

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error

const assertSafeArtifactKey = (
  outputDirectory: string,
  key: string,
): string => {
  const artifactPath = resolve(outputDirectory, key)
  const relativePath = relative(outputDirectory, artifactPath)

  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Unsafe artifact key: ${key}`)
  }

  return artifactPath
}

export const assertEmptyOutputDirectory = async (
  outputDirectory: string,
): Promise<void> => {
  try {
    const details = await lstat(outputDirectory)
    if (details.isSymbolicLink()) {
      throw new Error(`${outputDirectory} must not be a symbolic link`)
    }
    if (!details.isDirectory()) {
      throw new Error(`${outputDirectory} exists and is not a directory`)
    }
    if ((await readdir(outputDirectory)).length > 0) {
      throw new Error(`${outputDirectory} must be empty`)
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      await mkdir(outputDirectory, { recursive: true })
      return
    }

    throw error
  }
}

export const createLocalArtifactWriter = (
  outputDirectory: string,
): ArtifactWriter => {
  const resolvedOutputDirectory = resolve(outputDirectory)

  return {
    write: async (artifact) => {
      const artifactPath = assertSafeArtifactKey(
        resolvedOutputDirectory,
        artifact.key,
      )
      await mkdir(dirname(artifactPath), { recursive: true })
      await writeFile(artifactPath, artifact.body, {
        encoding: 'utf8',
        flag: 'wx',
      })
    },
  }
}

const encodeKey = (key: string): string =>
  key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

const isRetryableStatus = (status: number): boolean =>
  RETRYABLE_STATUS_CODES.has(status) || status >= 500

const defaultSleep = (delayMs: number): Promise<void> =>
  new Promise((resolvePromise) => {
    setTimeout(resolvePromise, delayMs)
  })

const validateR2Configuration = (params: {
  readonly accessKeyId: string
  readonly accountId: string
  readonly bucketName: string
  readonly secretAccessKey: string
}): void => {
  if (!ACCOUNT_ID_PATTERN.test(params.accountId)) {
    throw new Error('R2_ACCOUNT_ID must be a 32-character hex value')
  }
  if (!BUCKET_NAME_PATTERN.test(params.bucketName)) {
    throw new Error('R2_BUCKET_NAME is invalid')
  }
  if (!params.accessKeyId.trim()) {
    throw new Error('R2_ACCESS_KEY_ID is required')
  }
  if (!params.secretAccessKey.trim()) {
    throw new Error('R2_SECRET_ACCESS_KEY is required')
  }
}

type UploadAttempt =
  | { readonly status: 'response'; readonly response: Response }
  | { readonly status: 'network-error'; readonly error: unknown }

type UploadDisposition =
  | { readonly status: 'complete' }
  | { readonly status: 'retryable'; readonly error: unknown }

const getExistingObjectMismatch = async (params: {
  readonly bodyLength: number
  readonly bodySha256: string
  readonly expectedCacheControl: string
  readonly expectedContentType: string
  readonly response: Response
}): Promise<string | undefined> => {
  const storedSha256 = params.response.headers
    .get('x-amz-meta-sha256')
    ?.trim()
    .toLowerCase()
  if (!storedSha256) return 'is missing SHA-256 metadata'
  if (storedSha256 !== params.bodySha256) return 'has a different SHA-256'

  const storedContentType = params.response.headers
    .get('content-type')
    ?.toLowerCase()
  if (storedContentType !== params.expectedContentType.toLowerCase()) {
    return `has content type ${storedContentType ?? 'missing'}`
  }

  const storedContentLengthHeader =
    params.response.headers.get('content-length')
  const storedContentLength = storedContentLengthHeader
    ? Number(storedContentLengthHeader)
    : Number.NaN
  if (storedContentLength !== params.bodyLength) {
    return `has content length ${Number.isFinite(storedContentLength) ? storedContentLength : 'missing'}`
  }

  const storedCacheControl = params.response.headers
    .get('cache-control')
    ?.trim()
  if (storedCacheControl !== params.expectedCacheControl) {
    return `has cache control ${storedCacheControl ?? 'missing'}`
  }

  const storedBody = new Uint8Array(await params.response.arrayBuffer())
  if (storedBody.byteLength !== params.bodyLength) {
    return `contains ${storedBody.byteLength} bytes instead of ${params.bodyLength}`
  }
  const actualSha256 = createHash('sha256').update(storedBody).digest('hex')
  if (actualSha256 !== params.bodySha256) {
    return 'bytes do not match its SHA-256 metadata'
  }

  return undefined
}

const attemptUpload = async (params: {
  readonly artifact: Parameters<ArtifactWriter['write']>[0]
  readonly bodySha256: string
  readonly signedFetch: SignedFetch
  readonly url: string
}): Promise<UploadAttempt> => {
  try {
    const response = await params.signedFetch(params.url, {
      method: 'PUT',
      headers: {
        'Cache-Control': params.artifact.cacheControl,
        'Content-Type': params.artifact.contentType,
        'If-None-Match': '*',
        'x-amz-meta-sha256': params.bodySha256,
      },
      body: params.artifact.body,
    })
    return { status: 'response', response }
  } catch (error) {
    return { status: 'network-error', error }
  }
}

const checkExistingObject = async (params: {
  readonly artifactCacheControl: string
  readonly artifactContentType: string
  readonly artifactKey: string
  readonly bodyLength: number
  readonly bodySha256: string
  readonly signedFetch: SignedFetch
  readonly url: string
}): Promise<UploadDisposition> => {
  let response: Response
  try {
    response = await params.signedFetch(params.url, { method: 'GET' })
  } catch (error) {
    return { status: 'retryable', error }
  }

  if (response.status === 404 || isRetryableStatus(response.status)) {
    return {
      status: 'retryable',
      error: new Error(`R2 GET returned HTTP ${response.status}`),
    }
  }
  if (!response.ok) {
    throw new Error(
      `R2 could not verify existing object ${params.artifactKey}; GET returned HTTP ${response.status}`,
    )
  }

  let reason: string | undefined
  try {
    reason = await getExistingObjectMismatch({
      bodyLength: params.bodyLength,
      bodySha256: params.bodySha256,
      expectedCacheControl: params.artifactCacheControl,
      expectedContentType: params.artifactContentType,
      response,
    })
  } catch (error) {
    return { status: 'retryable', error }
  }
  if (!reason) return { status: 'complete' }
  throw new Error(
    `R2 object ${params.artifactKey} already exists and ${reason}; immutable artifacts cannot be overwritten`,
  )
}

const classifyUploadResponse = async (params: {
  readonly artifactCacheControl: string
  readonly artifactContentType: string
  readonly artifactKey: string
  readonly bodyLength: number
  readonly bodySha256: string
  readonly response: Response
  readonly signedFetch: SignedFetch
  readonly url: string
}): Promise<UploadDisposition> => {
  if (params.response.ok) return { status: 'complete' }
  if (params.response.status === 409 || params.response.status === 412) {
    return checkExistingObject(params)
  }
  if (isRetryableStatus(params.response.status)) {
    return {
      status: 'retryable',
      error: new Error(`R2 returned HTTP ${params.response.status}`),
    }
  }

  throw new Error(
    `R2 upload failed for ${params.artifactKey} with HTTP ${params.response.status}`,
  )
}

const uploadArtifactWithRetry = async (params: {
  readonly artifact: Parameters<ArtifactWriter['write']>[0]
  readonly maxAttempts: number
  readonly retryDelayMs: number
  readonly signedFetch: SignedFetch
  readonly sleep: (delayMs: number) => Promise<void>
  readonly url: string
}): Promise<void> => {
  let lastError: unknown
  const bodySha256 = createHash('sha256')
    .update(params.artifact.body)
    .digest('hex')
  const bodyLength = Buffer.byteLength(params.artifact.body)

  for (let attempt = 1; attempt <= params.maxAttempts; attempt += 1) {
    const result = await attemptUpload({ ...params, bodySha256 })

    if (result.status === 'network-error') {
      lastError = result.error
    } else {
      const disposition = await classifyUploadResponse({
        artifactCacheControl: params.artifact.cacheControl,
        artifactContentType: params.artifact.contentType,
        artifactKey: params.artifact.key,
        bodyLength,
        bodySha256,
        response: result.response,
        signedFetch: params.signedFetch,
        url: params.url,
      })
      if (disposition.status === 'complete') return
      lastError = disposition.error
    }

    if (attempt < params.maxAttempts) {
      await params.sleep(params.retryDelayMs * 2 ** (attempt - 1))
    }
  }

  throw new Error(
    `R2 upload failed for ${params.artifact.key} after ${params.maxAttempts} attempts`,
    { cause: lastError },
  )
}

export const createR2ArtifactWriter = (
  params: {
    readonly accessKeyId: string
    readonly accountId: string
    readonly bucketName: string
    readonly secretAccessKey: string
  },
  dependencies?: {
    readonly maxAttempts?: number
    readonly retryDelayMs?: number
    readonly signedFetch?: SignedFetch
    readonly sleep?: (delayMs: number) => Promise<void>
  },
): ArtifactWriter => {
  validateR2Configuration(params)

  const maxAttempts = dependencies?.maxAttempts ?? DEFAULT_R2_MAX_ATTEMPTS
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error('R2 max attempts must be a positive integer')
  }

  const retryDelayMs = dependencies?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0) {
    throw new Error('R2 retry delay must be a non-negative integer')
  }

  const awsClient = dependencies?.signedFetch
    ? undefined
    : new AwsClient({
        accessKeyId: params.accessKeyId,
        retries: 0,
        secretAccessKey: params.secretAccessKey,
        service: 's3',
        region: 'auto',
      })
  const signedFetch: SignedFetch =
    dependencies?.signedFetch ??
    ((input, init) => {
      if (!awsClient) throw new Error('R2 signing client is unavailable')
      return awsClient.fetch(input, {
        ...init,
        signal:
          init?.signal ?? AbortSignal.timeout(DEFAULT_R2_REQUEST_TIMEOUT_MS),
      })
    })
  const sleep = dependencies?.sleep ?? defaultSleep
  const origin = `https://${params.accountId}.r2.cloudflarestorage.com`

  return {
    write: async (artifact) => {
      const url = `${origin}/${params.bucketName}/${encodeKey(artifact.key)}`
      await uploadArtifactWithRetry({
        artifact,
        maxAttempts,
        retryDelayMs,
        signedFetch,
        sleep,
        url,
      })
    },
  }
}
