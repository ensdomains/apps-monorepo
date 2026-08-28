import { basename } from 'node:path'
import {
  DEFAULT_METADATA_RENDERER_ORIGIN,
  PILOT_ITEM_LIMIT,
  PINNED_RENDERER_REVISION,
  type PilotCliOptions,
  REVIEWED_MERKLE_ROOT,
  STAGING_ASSET_ORIGIN,
  STAGING_R2_ACCOUNT_ID,
  STAGING_R2_BUCKET_NAME,
} from './cli.js'
import { REVIEWED_PILOT_SNAPSHOT_INPUTS, SEED_DERIVATION } from './constants.js'
import {
  type LocalTokenState,
  loadReusableLocalToken,
  serializeJson,
  writeCompletionFile,
  writeNewLocalToken,
} from './files.js'
import { createTokenMetadata, getTokenArtifactPaths } from './metadata.js'
import { type PutImmutableResult, R2ObjectStore } from './r2.js'
import { createPngRenderer, type PngRenderer } from './render.js'
import { buildSnapshotMerkleTree, loadSnapshotCsvFiles } from './snapshot.js'
import type { SnapshotMerkleEntry, TokenMetadata } from './types.js'

type PreparedToken = {
  readonly entry: SnapshotMerkleEntry
  readonly metadata: TokenMetadata
  readonly metadataJson: string
  readonly reusable?: {
    readonly png: Uint8Array
    readonly state: LocalTokenState
  }
}

type CompletedToken = {
  readonly entry: SnapshotMerkleEntry
  readonly metadataJson: string
  readonly png: Uint8Array
  readonly state: LocalTokenState
}

type UploadedToken = {
  readonly imageUpload: PutImmutableResult
  readonly metadataUpload: PutImmutableResult
}

export type PilotResult = {
  readonly generatedItemCount: number
  readonly localExistingCount: number
  readonly localRenderedCount: number
  readonly manifestKey: string
  readonly merkleRoot: string
  readonly remoteExistingCount: number
  readonly remoteUploadedCount: number
  readonly snapshotAddressCount: number
}

const requireEnvironmentValue = (
  environment: NodeJS.ProcessEnv,
  name: string,
): string => {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required with --upload`)
  return value
}

const createR2Store = (
  options: PilotCliOptions,
  environment: NodeJS.ProcessEnv,
): R2ObjectStore | undefined => {
  if (!options.shouldUpload) return undefined
  return new R2ObjectStore({
    accessKeyId: requireEnvironmentValue(environment, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnvironmentValue(
      environment,
      'R2_SECRET_ACCESS_KEY',
    ),
    accountId: STAGING_R2_ACCOUNT_ID,
    bucketName: STAGING_R2_BUCKET_NAME,
    writeEnabled: true,
  })
}

const assertReviewedUploadInputs = (
  sources: readonly {
    readonly path: string
    readonly sha256: string
  }[],
): void => {
  if (sources.length !== REVIEWED_PILOT_SNAPSHOT_INPUTS.length) {
    throw new Error(
      `Upload requires ${REVIEWED_PILOT_SNAPSHOT_INPUTS.length} reviewed snapshot files; received ${sources.length}`,
    )
  }

  for (const [index, expected] of REVIEWED_PILOT_SNAPSHOT_INPUTS.entries()) {
    const source = sources[index]
    const actualName = source ? basename(source.path) : undefined
    if (actualName !== expected.name || source?.sha256 !== expected.sha256) {
      throw new Error(
        `Upload snapshot ${index + 1} does not match the reviewed input ${expected.name}`,
      )
    }
  }
}

const assertReviewedUploadOptions = (options: PilotCliOptions): void => {
  const hasReviewedOptions =
    options.assetOrigin === STAGING_ASSET_ORIGIN &&
    options.metadataRendererOrigin === DEFAULT_METADATA_RENDERER_ORIGIN &&
    options.externalOrigin === undefined &&
    options.rendererRevision === PINNED_RENDERER_REVISION &&
    options.expectedRoot.toLowerCase() === REVIEWED_MERKLE_ROOT &&
    options.legacySwappedTraitColumns &&
    options.offset === 0 &&
    options.limit === PILOT_ITEM_LIMIT
  if (!hasReviewedOptions) {
    throw new Error(
      '--upload requires the reviewed asset/metadata origins, renderer revision, Merkle root, legacy column correction, offset 0, and limit 100',
    )
  }
}

const remoteInventoryError = (label: string, keys: readonly string[]): Error =>
  new Error(
    `${label}: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ` (+${keys.length - 5} more)` : ''}`,
  )

const assertOnlyExpectedRemoteKeys = (params: {
  readonly actualKeys: readonly string[]
  readonly expectedKeys: ReadonlySet<string>
}): void => {
  const unexpectedKeys = params.actualKeys.filter(
    (key) => !params.expectedKeys.has(key),
  )
  if (unexpectedKeys.length > 0) {
    throw remoteInventoryError(
      'R2 contains objects outside this reviewed pilot',
      unexpectedKeys,
    )
  }
}

const assertRemoteKeysPresent = (params: {
  readonly actualKeys: readonly string[]
  readonly requiredKeys: readonly string[]
}): void => {
  const actualKeys = new Set(params.actualKeys)
  const missingKeys = params.requiredKeys.filter((key) => !actualKeys.has(key))
  if (missingKeys.length > 0) {
    throw remoteInventoryError(
      'R2 is missing reviewed pilot objects',
      missingKeys,
    )
  }
}

const assertExactRemoteKeys = (params: {
  readonly actualKeys: readonly string[]
  readonly expectedKeys: readonly string[]
}): void => {
  const expectedKeys = new Set(params.expectedKeys)
  assertOnlyExpectedRemoteKeys({
    actualKeys: params.actualKeys,
    expectedKeys,
  })
  assertRemoteKeysPresent({
    actualKeys: params.actualKeys,
    requiredKeys: params.expectedKeys,
  })
}

const processInBatches = async <Value, Result>(params: {
  readonly concurrency: number
  readonly operation: (value: Value) => Promise<Result>
  readonly values: readonly Value[]
}): Promise<readonly Result[]> => {
  const results: Result[] = []
  for (
    let offset = 0;
    offset < params.values.length;
    offset += params.concurrency
  ) {
    const batch = params.values.slice(offset, offset + params.concurrency)
    const settled = await Promise.allSettled(batch.map(params.operation))
    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (failure) throw failure.reason
    results.push(
      ...settled.map(
        (result) => (result as PromiseFulfilledResult<Result>).value,
      ),
    )
  }
  return results
}

const prepareToken = async (params: {
  readonly entry: SnapshotMerkleEntry
  readonly options: PilotCliOptions
}): Promise<PreparedToken> => {
  const metadata = createTokenMetadata({
    entry: params.entry,
    urls: {
      assetOrigin: params.options.assetOrigin,
      rendererOrigin: params.options.metadataRendererOrigin,
      ...(params.options.externalOrigin
        ? { externalOrigin: params.options.externalOrigin }
        : {}),
    },
  })
  const metadataJson = serializeJson(metadata)
  const reusable = await loadReusableLocalToken({
    metadataJson,
    outputDirectory: params.options.outputDirectory,
    rendererRevision: params.options.rendererRevision,
    tokenId: params.entry.row.tokenId,
  })
  return {
    entry: params.entry,
    metadata,
    metadataJson,
    ...(reusable ? { reusable } : {}),
  }
}

const completeLocalToken = async (params: {
  readonly prepared: PreparedToken
  readonly options: PilotCliOptions
  readonly renderer?: PngRenderer
}): Promise<CompletedToken> => {
  const tokenId = params.prepared.entry.row.tokenId
  let png: Uint8Array
  let state: LocalTokenState

  if (params.prepared.reusable) {
    png = params.prepared.reusable.png
    state = params.prepared.reusable.state
  } else {
    if (!params.renderer) {
      throw new Error(`Renderer is unavailable for new token ${tokenId}`)
    }
    const rendered = await params.renderer.render({
      tokenId,
      tokenUri: params.prepared.metadata,
    })
    png = rendered.png
    state = await writeNewLocalToken({
      bundleUrl: rendered.bundleUrl,
      metadataJson: params.prepared.metadataJson,
      outputDirectory: params.options.outputDirectory,
      png,
      rendererRevision: rendered.rendererRevision,
      tokenId,
    })
  }

  return {
    entry: params.prepared.entry,
    metadataJson: params.prepared.metadataJson,
    png,
    state,
  }
}

const uploadToken = async (params: {
  readonly completed: CompletedToken
  readonly options: PilotCliOptions
  readonly store: R2ObjectStore
}): Promise<UploadedToken> => {
  const tokenId = params.completed.entry.row.tokenId
  const paths = getTokenArtifactPaths(tokenId)
  const objectMetadata = {
    'merkle-root': params.options.expectedRoot.toLowerCase(),
    'renderer-revision': params.options.rendererRevision,
    scope: 'pilot',
  }
  const imageUpload = await params.store.putImmutable(
    paths.image,
    params.completed.png,
    {
      contentType: 'image/png',
      metadata: objectMetadata,
    },
  )
  // Publish each token's metadata only after its image exists and is verified.
  const metadataUpload = await params.store.putImmutable(
    paths.metadata,
    params.completed.metadataJson,
    {
      contentType: 'application/json; charset=utf-8',
      metadata: objectMetadata,
    },
  )
  return { imageUpload, metadataUpload }
}

export const runPilot = async (
  options: PilotCliOptions,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PilotResult> => {
  if (
    !Number.isSafeInteger(options.limit) ||
    options.limit <= 0 ||
    options.limit > PILOT_ITEM_LIMIT
  ) {
    throw new Error(
      `runPilot is hard-capped at ${PILOT_ITEM_LIMIT} items; received ${options.limit}`,
    )
  }

  if (options.shouldUpload) assertReviewedUploadOptions(options)
  const store = createR2Store(options, environment)
  const snapshot = await loadSnapshotCsvFiles({
    inputPaths: options.inputPaths,
    legacySwappedTraitColumns: options.legacySwappedTraitColumns,
  })
  if (options.shouldUpload) assertReviewedUploadInputs(snapshot.sources)
  if (options.offset >= snapshot.rows.length) {
    throw new Error(
      `Pilot offset ${options.offset} is outside ${snapshot.rows.length} eligible addresses`,
    )
  }

  const selectedRows = snapshot.rows.slice(
    options.offset,
    options.offset + options.limit,
  )
  const merkle = buildSnapshotMerkleTree({
    snapshot,
    expectedRoot: options.expectedRoot,
    proofRows: selectedRows,
  })
  const prepared = await processInBatches({
    concurrency: options.concurrency,
    values: merkle.entries,
    operation: (entry) => prepareToken({ entry, options }),
  })

  const needsRenderer = prepared.some((token) => !token.reusable)
  const renderer = needsRenderer
    ? await createPngRenderer({
        concurrency: options.concurrency,
        rendererOrigin: options.captureRendererOrigin,
        rendererRevision: options.rendererRevision,
        ...(options.chromiumExecutablePath
          ? { executablePath: options.chromiumExecutablePath }
          : {}),
      })
    : undefined

  let completed: readonly CompletedToken[]
  try {
    completed = await processInBatches({
      concurrency: options.concurrency,
      values: prepared,
      operation: (token) =>
        completeLocalToken({ prepared: token, options, renderer }),
    })
  } finally {
    await renderer?.close()
  }

  const manifestKey = `manifests/pilot-${options.offset}-${selectedRows.length}.json`
  const bundleUrls = [
    ...new Set(completed.map((token) => token.state.bundleUrl)),
  ].sort()
  const manifest = {
    schemaVersion: 1,
    scope: 'pilot',
    isFullDataset: false,
    merkleRoot: merkle.root,
    seedDerivation: SEED_DERIVATION,
    deduplication:
      'maximum numeric days_held, then win1, then global source order',
    sourceFiles: snapshot.sources.map((source, index) => ({
      index,
      name: basename(source.path),
      rowCount: source.rowCount,
      sha256: source.sha256,
    })),
    snapshot: snapshot.stats,
    selection: {
      addressSort: 'lowercase ascending',
      offset: options.offset,
      limit: options.limit,
      generatedItemCount: completed.length,
    },
    renderer: {
      captureOrigins: [
        ...new Set(bundleUrls.map((bundleUrl) => new URL(bundleUrl).origin)),
      ].sort(),
      metadataOrigin: options.metadataRendererOrigin,
      revision: options.rendererRevision,
      bundleUrls,
    },
    storage: {
      assetOrigin: options.assetOrigin,
      accountId: STAGING_R2_ACCOUNT_ID,
      bucketName: STAGING_R2_BUCKET_NAME,
      tokenKeyFormat: 'token/<decimal-token-id>.{png,json}',
      manifestKey,
    },
    items: completed.map(({ entry, state }) => ({
      address: entry.row.address,
      tokenId: entry.row.tokenId,
      pngSha256: state.pngSha256,
      metadataSha256: state.metadataSha256,
    })),
  }
  const manifestJson = serializeJson(manifest)
  const tokenKeys = completed.flatMap((token) => {
    const paths = getTokenArtifactPaths(token.entry.row.tokenId)
    return [paths.image, paths.metadata]
  })
  const expectedRemoteKeys = [...tokenKeys, manifestKey].sort((left, right) =>
    left.localeCompare(right, 'en-US'),
  )
  const expectedRemoteKeySet = new Set(expectedRemoteKeys)

  await writeCompletionFile({
    body: manifestJson,
    outputDirectory: options.outputDirectory,
    relativePath: manifestKey,
  })

  // Finish and validate the complete local batch before publishing any object.
  if (store) {
    const existingKeys = await store.listKeys()
    assertOnlyExpectedRemoteKeys({
      actualKeys: existingKeys,
      expectedKeys: expectedRemoteKeySet,
    })
    if (existingKeys.includes(manifestKey)) {
      assertExactRemoteKeys({
        actualKeys: existingKeys,
        expectedKeys: expectedRemoteKeys,
      })
    }
  }
  const uploaded = store
    ? await processInBatches({
        concurrency: options.concurrency,
        values: completed,
        operation: (token) => uploadToken({ completed: token, options, store }),
      })
    : []

  if (store) {
    const tokenInventory = await store.listKeys()
    assertOnlyExpectedRemoteKeys({
      actualKeys: tokenInventory,
      expectedKeys: expectedRemoteKeySet,
    })
    assertRemoteKeysPresent({
      actualKeys: tokenInventory,
      requiredKeys: tokenKeys,
    })
  }
  // The scoped pilot manifest is the final remote completion marker. It can
  // never be mistaken for the eventual full-dataset manifest.
  if (store) {
    await store.putImmutable(manifestKey, manifestJson, {
      contentType: 'application/json; charset=utf-8',
      metadata: {
        'merkle-root': merkle.root,
        'renderer-revision': options.rendererRevision,
        scope: 'pilot',
      },
    })
    const finalInventory = await store.listKeys()
    assertExactRemoteKeys({
      actualKeys: finalInventory,
      expectedKeys: expectedRemoteKeys,
    })
  }

  const uploads = uploaded.flatMap((token) =>
    [token.imageUpload, token.metadataUpload].filter(
      (upload): upload is PutImmutableResult => Boolean(upload),
    ),
  )
  return {
    generatedItemCount: completed.length,
    localExistingCount: prepared.filter((token) => token.reusable).length,
    localRenderedCount: prepared.filter((token) => !token.reusable).length,
    manifestKey,
    merkleRoot: merkle.root,
    remoteExistingCount: uploads.filter(
      (upload) => upload.disposition === 'existing',
    ).length,
    remoteUploadedCount: uploads.filter(
      (upload) => upload.disposition === 'uploaded',
    ).length,
    snapshotAddressCount: snapshot.stats.eligibleAddressCount,
  }
}
