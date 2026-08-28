import { randomUUID } from 'node:crypto'
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { sha256Hex, validatePng } from './media.js'
import { getTokenArtifactPaths } from './metadata.js'

const JSON_ESCAPE_VALUES: Readonly<Record<string, string>> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

export type LocalTokenState = {
  readonly schemaVersion: 1
  readonly tokenId: string
  readonly metadataSha256: string
  readonly pngSha256: string
  readonly rendererRevision: string
  readonly bundleUrl: string
}

export type ReusableLocalToken = {
  readonly png: Uint8Array
  readonly state: LocalTokenState
}

export const serializeJson = (value: unknown): string => {
  const serialized = JSON.stringify(value, null, 2)
  if (serialized === undefined) {
    throw new Error('Cannot serialize undefined JSON')
  }
  return `${serialized.replace(
    /[<>&\u2028\u2029]/g,
    (character) => JSON_ESCAPE_VALUES[character] ?? character,
  )}\n`
}

const readFileIfPresent = async (
  path: string,
): Promise<Uint8Array | undefined> => {
  try {
    return await readFile(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

const writeFileAtomicExclusive = async (
  path: string,
  value: Uint8Array | string,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`
  await writeFile(temporaryPath, value, { flag: 'wx' })
  try {
    await link(temporaryPath, path)
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

const tokenLocalPaths = (outputDirectory: string, tokenId: string) => {
  const artifacts = getTokenArtifactPaths(tokenId)
  return {
    image: join(outputDirectory, artifacts.image),
    metadata: join(outputDirectory, artifacts.metadata),
    state: join(outputDirectory, 'state', `${tokenId}.json`),
  }
}

const parseTokenState = (raw: Uint8Array, path: string): LocalTokenState => {
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(raw).toString('utf8'))
  } catch (error) {
    throw new Error(`Invalid local token state JSON: ${path}`, { cause: error })
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Invalid local token state object: ${path}`)
  }

  const state = value as Partial<LocalTokenState>
  if (
    state.schemaVersion !== 1 ||
    typeof state.tokenId !== 'string' ||
    typeof state.metadataSha256 !== 'string' ||
    typeof state.pngSha256 !== 'string' ||
    typeof state.rendererRevision !== 'string' ||
    typeof state.bundleUrl !== 'string'
  ) {
    throw new Error(`Incomplete local token state: ${path}`)
  }
  return state as LocalTokenState
}

export const loadReusableLocalToken = async (params: {
  readonly metadataJson: string
  readonly outputDirectory: string
  readonly rendererRevision: string
  readonly tokenId: string
}): Promise<ReusableLocalToken | undefined> => {
  const paths = tokenLocalPaths(params.outputDirectory, params.tokenId)
  const [image, metadata, rawState] = await Promise.all([
    readFileIfPresent(paths.image),
    readFileIfPresent(paths.metadata),
    readFileIfPresent(paths.state),
  ])
  if (!image && !metadata && !rawState) return undefined
  if (!image || !metadata || !rawState) {
    throw new Error(
      `Partial local output exists for token ${params.tokenId}; remove its PNG, JSON, and state file together before retrying`,
    )
  }

  validatePng(image)
  const metadataString = Buffer.from(metadata).toString('utf8')
  const state = parseTokenState(rawState, paths.state)
  const metadataSha256 = sha256Hex(params.metadataJson)
  const pngSha256 = sha256Hex(image)
  if (
    metadataString !== params.metadataJson ||
    state.tokenId !== params.tokenId ||
    state.metadataSha256 !== metadataSha256 ||
    state.pngSha256 !== pngSha256 ||
    state.rendererRevision !== params.rendererRevision
  ) {
    throw new Error(
      `Local output conflict for token ${params.tokenId}; existing artifacts were generated from different inputs`,
    )
  }

  return { png: image, state }
}

export const writeNewLocalToken = async (params: {
  readonly bundleUrl: string
  readonly metadataJson: string
  readonly outputDirectory: string
  readonly png: Uint8Array
  readonly rendererRevision: string
  readonly tokenId: string
}): Promise<LocalTokenState> => {
  validatePng(params.png)
  const paths = tokenLocalPaths(params.outputDirectory, params.tokenId)
  const state: LocalTokenState = {
    schemaVersion: 1,
    tokenId: params.tokenId,
    metadataSha256: sha256Hex(params.metadataJson),
    pngSha256: sha256Hex(params.png),
    rendererRevision: params.rendererRevision,
    bundleUrl: params.bundleUrl,
  }

  // Media is committed before metadata so an interrupted run never publishes
  // metadata whose image is missing.
  await writeFileAtomicExclusive(paths.image, params.png)
  await writeFileAtomicExclusive(paths.metadata, params.metadataJson)
  await writeFileAtomicExclusive(paths.state, serializeJson(state))
  return state
}

export const writeCompletionFile = async (params: {
  readonly body: string
  readonly outputDirectory: string
  readonly relativePath: string
}): Promise<'existing' | 'written'> => {
  const path = join(params.outputDirectory, params.relativePath)
  const existing = await readFileIfPresent(path)
  if (existing) {
    if (Buffer.from(existing).toString('utf8') !== params.body) {
      throw new Error(`Completion file conflict: ${path}`)
    }
    return 'existing'
  }

  await writeFileAtomicExclusive(path, params.body)
  return 'written'
}
