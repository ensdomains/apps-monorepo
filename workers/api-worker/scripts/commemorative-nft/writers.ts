import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { AwsClient } from 'aws4fetch'
import type { ArtifactWriter } from './types'

const DEFAULT_R2_MAX_ATTEMPTS = 5
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

const attemptUpload = async (params: {
  readonly artifact: Parameters<ArtifactWriter['write']>[0]
  readonly signedFetch: SignedFetch
  readonly url: string
}): Promise<UploadAttempt> => {
  const bodySha256 = createHash('sha256')
    .update(params.artifact.body)
    .digest('hex')

  try {
    const response = await params.signedFetch(params.url, {
      method: 'PUT',
      headers: {
        'Cache-Control': params.artifact.cacheControl,
        'Content-Type': params.artifact.contentType,
        'If-None-Match': '*',
        'x-amz-meta-sha256': bodySha256,
      },
      body: params.artifact.body,
    })
    return { status: 'response', response }
  } catch (error) {
    return { status: 'network-error', error }
  }
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

  for (let attempt = 1; attempt <= params.maxAttempts; attempt += 1) {
    const result = await attemptUpload(params)

    if (result.status === 'network-error') {
      lastError = result.error
    } else if (result.response.ok) {
      return
    } else if (!isRetryableStatus(result.response.status)) {
      if (result.response.status === 409 || result.response.status === 412) {
        throw new Error(
          `R2 object ${params.artifact.key} already exists; immutable artifacts cannot be overwritten`,
        )
      }
      throw new Error(
        `R2 upload failed for ${params.artifact.key} with HTTP ${result.response.status}`,
      )
    } else {
      lastError = new Error(`R2 returned HTTP ${result.response.status}`)
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
        secretAccessKey: params.secretAccessKey,
        service: 's3',
        region: 'auto',
      })
  const signedFetch: SignedFetch =
    dependencies?.signedFetch ??
    ((input, init) => {
      if (!awsClient) throw new Error('R2 signing client is unavailable')
      return awsClient.fetch(input, init)
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
