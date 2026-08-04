import type { MediaCapture } from './capture.js'
import {
  ImmutableArtifactConflictError,
  InvalidGenerationInputError,
} from './errors.js'
import {
  normalizeTokenId,
  renderInputKey,
  tokenAssetKey,
  tokenCompletionKey,
} from './keys.js'
import { sha256Hex } from './media.js'
import type { ObjectStore, ReadObject, StoredObject } from './r2.js'
import { parseRenderInput, type RenderInput } from './renderInput.js'
import type { GeneratorRuntimeAdapter } from './runtime.js'

export type ArtifactRecord = {
  readonly contentType?: string
  readonly key: string
  readonly sha256: string
  readonly size: number
}

export type GenerationRecord = {
  readonly artifacts: readonly ArtifactRecord[]
  readonly rendererRevision: string
  readonly runtimeAdapter: GeneratorRuntimeAdapter
  readonly tokenId: string
}

const COMPLETION_SCHEMA_VERSION = 1

const requireStoredHash = (
  key: string,
  object: StoredObject | undefined,
): ArtifactRecord => {
  if (!object || object.size <= 0 || !object.sha256) {
    throw new Error(`Generated artifact ${key} is missing or incomplete`)
  }

  return {
    contentType: object.contentType,
    key,
    sha256: object.sha256,
    size: object.size,
  }
}

const requireStoredArtifact = (params: {
  readonly contentType: string
  readonly key: string
  readonly object: StoredObject | undefined
  readonly rendererRevision: string
  readonly runtimeAdapter: GeneratorRuntimeAdapter
}): ArtifactRecord => {
  const artifact = requireStoredHash(params.key, params.object)
  if (
    params.object?.contentType !== params.contentType ||
    params.object.rendererRevision !== params.rendererRevision ||
    params.object.runtimeAdapter !== params.runtimeAdapter
  ) {
    throw new ImmutableArtifactConflictError(
      `Generated artifact ${params.key} has stale or invalid storage metadata`,
    )
  }
  return artifact
}

const requireVerifiedObject = (
  key: string,
  object: ReadObject | undefined,
  rendererRevision: string,
  runtimeAdapter: GeneratorRuntimeAdapter,
  contentType: string,
): ArtifactRecord => {
  if (!object || object.body.byteLength === 0) {
    throw new Error(`Generated artifact ${key} is missing or empty`)
  }

  const actualSha256 = sha256Hex(object.body)
  if (object.sha256 !== actualSha256) {
    throw new ImmutableArtifactConflictError(
      `Generated artifact ${key} failed SHA-256 verification`,
    )
  }
  if (
    object.rendererRevision !== rendererRevision ||
    object.runtimeAdapter !== runtimeAdapter
  ) {
    throw new ImmutableArtifactConflictError(
      `Generated artifact ${key} has stale runtime metadata`,
    )
  }
  if (object.contentType !== contentType) {
    throw new ImmutableArtifactConflictError(
      `Generated artifact ${key} has an invalid content type`,
    )
  }

  return {
    contentType,
    key,
    sha256: actualSha256,
    size: object.body.byteLength,
  }
}

const requireStoredCompletion = (
  key: string,
  object: StoredObject | undefined,
  bodySha256: string,
  rendererRevision: string,
  runtimeAdapter: GeneratorRuntimeAdapter,
): void => {
  if (
    !object ||
    object.size <= 0 ||
    object.sha256 !== bodySha256 ||
    object.contentType !== 'application/json; charset=utf-8' ||
    object.rendererRevision !== rendererRevision ||
    object.runtimeAdapter !== runtimeAdapter
  ) {
    throw new ImmutableArtifactConflictError(
      `Generated completion marker ${key} has invalid storage metadata`,
    )
  }
}

const assetUrl = (
  publicAssetOrigin: string,
  tokenId: string,
  extension: 'mp4' | 'png',
): string => `${publicAssetOrigin}/${tokenId}.${extension}`

export class TokenGenerationService {
  readonly #capture: MediaCapture
  readonly #externalOrigin?: string
  readonly #publicAssetOrigin: string
  readonly #publicR2Origin: string
  readonly #rendererRevision: string
  readonly #runtimeAdapter: GeneratorRuntimeAdapter
  readonly #store: ObjectStore

  constructor(params: {
    readonly capture: MediaCapture
    readonly externalOrigin?: string
    readonly publicAssetOrigin: string
    readonly publicR2Origin: string
    readonly rendererRevision: string
    readonly runtimeAdapter: GeneratorRuntimeAdapter
    readonly store: ObjectStore
  }) {
    this.#capture = params.capture
    this.#externalOrigin = params.externalOrigin
    this.#publicAssetOrigin = params.publicAssetOrigin
    this.#publicR2Origin = params.publicR2Origin
    this.#rendererRevision = params.rendererRevision
    this.#runtimeAdapter = params.runtimeAdapter
    this.#store = params.store
  }

  async #loadInput(tokenId: string): Promise<RenderInput> {
    const key = renderInputKey(tokenId)
    let rawInput: unknown
    try {
      rawInput = await this.#store.getJson(key)
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new InvalidGenerationInputError(
          `Render input ${key} is not valid JSON`,
        )
      }
      throw error
    }
    if (rawInput === undefined) {
      throw new InvalidGenerationInputError(`Render input ${key} was not found`)
    }

    try {
      return parseRenderInput(rawInput)
    } catch (error) {
      throw new InvalidGenerationInputError(
        `Render input ${key} is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  #record(
    tokenId: string,
    artifacts: readonly ArtifactRecord[],
  ): GenerationRecord {
    return {
      artifacts,
      rendererRevision: this.#rendererRevision,
      runtimeAdapter: this.#runtimeAdapter,
      tokenId,
    }
  }

  async captureAndPersistMedia(rawTokenId: string): Promise<GenerationRecord> {
    const tokenId = normalizeTokenId(rawTokenId)
    const input = await this.#loadInput(tokenId)
    const inputKey = renderInputKey(tokenId)
    const media = await this.#capture.capture({
      tokenId,
      renderInput: input,
      renderInputUrl: `${this.#publicR2Origin}/${inputKey}`,
    })

    const customMetadata = {
      'renderer-revision': this.#rendererRevision,
      'runtime-adapter': this.#runtimeAdapter,
    }
    const pngKey = tokenAssetKey(tokenId, 'png')
    const mp4Key = tokenAssetKey(tokenId, 'mp4')
    const [png, mp4] = await Promise.all([
      this.#store.putImmutable(pngKey, media.png, {
        contentType: 'image/png',
        customMetadata,
      }),
      this.#store.putImmutable(mp4Key, media.mp4, {
        contentType: 'video/mp4',
        customMetadata,
      }),
    ])

    return this.#record(tokenId, [
      requireStoredArtifact({
        contentType: 'image/png',
        key: pngKey,
        object: png,
        rendererRevision: this.#rendererRevision,
        runtimeAdapter: this.#runtimeAdapter,
      }),
      requireStoredArtifact({
        contentType: 'video/mp4',
        key: mp4Key,
        object: mp4,
        rendererRevision: this.#rendererRevision,
        runtimeAdapter: this.#runtimeAdapter,
      }),
    ])
  }

  async publishMetadata(rawTokenId: string): Promise<GenerationRecord> {
    const tokenId = normalizeTokenId(rawTokenId)
    const input = await this.#loadInput(tokenId)
    const pngKey = tokenAssetKey(tokenId, 'png')
    const mp4Key = tokenAssetKey(tokenId, 'mp4')
    const [png, mp4] = await Promise.all([
      this.#store.head(pngKey),
      this.#store.head(mp4Key),
    ])
    const mediaArtifacts = [
      requireStoredArtifact({
        contentType: 'image/png',
        key: pngKey,
        object: png,
        rendererRevision: this.#rendererRevision,
        runtimeAdapter: this.#runtimeAdapter,
      }),
      requireStoredArtifact({
        contentType: 'video/mp4',
        key: mp4Key,
        object: mp4,
        rendererRevision: this.#rendererRevision,
        runtimeAdapter: this.#runtimeAdapter,
      }),
    ]

    const metadata = JSON.stringify({
      ...input,
      image: assetUrl(this.#publicAssetOrigin, tokenId, 'png'),
      animation_url: assetUrl(this.#publicAssetOrigin, tokenId, 'mp4'),
      ...(this.#externalOrigin ? { external_url: this.#externalOrigin } : {}),
      properties: {
        renderer_revision: this.#rendererRevision,
        runtime_adapter: this.#runtimeAdapter,
      },
    })
    const metadataKey = tokenAssetKey(tokenId, 'json')
    const storedMetadata = await this.#store.putImmutable(
      metadataKey,
      metadata,
      {
        contentType: 'application/json; charset=utf-8',
        customMetadata: {
          'renderer-revision': this.#rendererRevision,
          'runtime-adapter': this.#runtimeAdapter,
        },
      },
    )

    return this.#record(tokenId, [
      ...mediaArtifacts,
      {
        ...requireStoredHash(metadataKey, storedMetadata),
        sha256: sha256Hex(metadata),
      },
    ])
  }

  async verifyArtifacts(rawTokenId: string): Promise<GenerationRecord> {
    const tokenId = normalizeTokenId(rawTokenId)
    const expectedObjects = [
      {
        contentType: 'image/png',
        key: tokenAssetKey(tokenId, 'png'),
      },
      {
        contentType: 'video/mp4',
        key: tokenAssetKey(tokenId, 'mp4'),
      },
      {
        contentType: 'application/json; charset=utf-8',
        key: tokenAssetKey(tokenId, 'json'),
      },
    ] as const
    const objects = await Promise.all(
      expectedObjects.map(({ key }) => this.#store.read(key)),
    )
    const artifacts = expectedObjects.map(({ contentType, key }, index) =>
      requireVerifiedObject(
        key,
        objects[index],
        this.#rendererRevision,
        this.#runtimeAdapter,
        contentType,
      ),
    )

    const completionKey = tokenCompletionKey(tokenId)
    const completion = JSON.stringify({
      schemaVersion: COMPLETION_SCHEMA_VERSION,
      tokenId,
      rendererRevision: this.#rendererRevision,
      runtimeAdapter: this.#runtimeAdapter,
      artifacts,
    })
    const storedCompletion = await this.#store.putImmutable(
      completionKey,
      completion,
      {
        contentType: 'application/json; charset=utf-8',
        customMetadata: {
          'renderer-revision': this.#rendererRevision,
          'runtime-adapter': this.#runtimeAdapter,
        },
      },
    )
    requireStoredCompletion(
      completionKey,
      storedCompletion,
      sha256Hex(completion),
      this.#rendererRevision,
      this.#runtimeAdapter,
    )

    return this.#record(tokenId, artifacts)
  }
}
