import { createReadStream } from 'node:fs'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { parse } from 'csv-parse'
import { type Address, getAddress, type Hex } from 'viem'
import {
  COMMEMORATIVE_NFT_DESCRIPTION,
  DEFAULT_WRITE_CONCURRENCY,
  PIPELINE_MANIFEST_SCHEMA_VERSION,
  SEED_DERIVATION,
} from './constants'
import {
  getCommemorativeNftTokenId,
  getEligibilityKey,
  getRenderInputKey,
} from './keys'
import {
  getRendererAttributes,
  getRendererName,
  mapRendererTraits,
  normalizeProfileName,
} from './traits'
import type {
  Artifact,
  ArtifactWriter,
  CommemorativeNftEligibility,
  CommemorativeNftRenderInput,
  LoadedSnapshot,
  PipelineManifest,
  SnapshotRow,
} from './types'

type CsvRecord = Readonly<Record<string, string>>

const CSV_OPTIONS = {
  bom: true,
  columns: true,
  relax_column_count: false,
  skip_empty_lines: true,
  skip_records_with_empty_values: false,
  trim: true,
} as const

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8'
const EXPECTED_ROOT_PATTERN = /^0x[0-9a-fA-F]{64}$/

export class SnapshotPipelineError extends Error {
  override readonly name = 'SnapshotPipelineError'
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const compareAddresses = (left: SnapshotRow, right: SnapshotRow): number => {
  const leftAddress = left.address.toLowerCase()
  const rightAddress = right.address.toLowerCase()
  if (leftAddress === rightAddress) return 0
  return leftAddress < rightAddress ? -1 : 1
}

const parseCsvRecord = (value: unknown): CsvRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SnapshotPipelineError('CSV parser returned a non-object record')
  }

  const entries = Object.entries(value)
  if (!entries.every(([, entryValue]) => typeof entryValue === 'string')) {
    throw new SnapshotPipelineError('CSV record contains a non-string value')
  }

  return Object.fromEntries(entries) as Record<string, string>
}

const requiredColumn = (
  record: CsvRecord,
  column: string,
  rowLabel?: string,
): string => {
  const value = record[column]?.trim()
  if (value) return value

  throw new SnapshotPipelineError(
    `Missing required "${column}"${rowLabel ? ` at ${rowLabel}` : ''}`,
  )
}

const getDisplayName = (record: CsvRecord, rowLabel?: string): string =>
  record.primary_name?.trim() ||
  record.oldest_name?.trim() ||
  requiredColumn(record, 'name', rowLabel)

export const mapSnapshotCsvRecord = (
  record: CsvRecord,
  rowLabel?: string,
): SnapshotRow => {
  const rawAddress = requiredColumn(record, 'current_owner', rowLabel)
  let address: Address

  try {
    address = getAddress(rawAddress)
  } catch (error) {
    throw new SnapshotPipelineError(
      `Invalid "current_owner"${rowLabel ? ` at ${rowLabel}` : ''}: ${getErrorMessage(error)}`,
      { cause: error },
    )
  }

  const profileName = normalizeProfileName(getDisplayName(record, rowLabel))
  const rendererName = getRendererName(profileName)

  return {
    address,
    profileName,
    rendererName,
    traits: mapRendererTraits({
      genesisEra: requiredColumn(record, 'genesis_era', rowLabel),
      collectionDepth: requiredColumn(record, 'collection_depth', rowLabel),
      gasVeteran: record.gas_veteran ?? '',
      nameArchetype: requiredColumn(record, 'name_archetype', rowLabel),
      rendererName,
    }),
  }
}

const rowFingerprint = (row: SnapshotRow): string =>
  JSON.stringify({
    profileName: row.profileName,
    rendererName: row.rendererName,
    traits: row.traits,
  })

export const mergeSnapshotRows = (
  existing: SnapshotRow,
  incoming: SnapshotRow,
): SnapshotRow => {
  if (rowFingerprint(existing) !== rowFingerprint(incoming)) {
    throw new SnapshotPipelineError(
      `Conflicting snapshot rows for ${existing.address.toLowerCase()}`,
    )
  }

  return existing
}

const mapSnapshotRecordWithContext = (
  rawRecord: unknown,
  rowLabel: string,
): SnapshotRow => {
  const record = parseCsvRecord(rawRecord)

  try {
    return mapSnapshotCsvRecord(record, rowLabel)
  } catch (error) {
    if (
      error instanceof SnapshotPipelineError &&
      error.message.includes(rowLabel)
    ) {
      throw error
    }

    throw new SnapshotPipelineError(
      `Invalid snapshot row at ${rowLabel}: ${getErrorMessage(error)}`,
      { cause: error },
    )
  }
}

const readSnapshotCsvFile = async (
  inputPath: string,
  onRow: (row: SnapshotRow, rowLabel: string) => void,
): Promise<number> => {
  const parser = createReadStream(inputPath).pipe(parse(CSV_OPTIONS))
  let sourceRowCount = 0
  let fileRowNumber = 1

  try {
    for await (const rawRecord of parser) {
      fileRowNumber += 1
      sourceRowCount += 1
      const rowLabel = `${inputPath}:${fileRowNumber}`
      onRow(mapSnapshotRecordWithContext(rawRecord, rowLabel), rowLabel)
    }
  } catch (error) {
    if (error instanceof SnapshotPipelineError) throw error

    throw new SnapshotPipelineError(
      `Failed to read snapshot CSV ${inputPath}: ${getErrorMessage(error)}`,
      { cause: error },
    )
  }

  return sourceRowCount
}

export const loadSnapshotCsvFiles = async (
  inputPaths: readonly string[],
): Promise<LoadedSnapshot> => {
  if (inputPaths.length === 0) {
    throw new SnapshotPipelineError('At least one snapshot CSV is required')
  }

  // A mutable map is intentional here: the source can contain roughly 500k
  // rows, and streaming into one deduplicating index avoids retaining a second
  // full copy of the parsed CSV.
  const rowsByAddress = new Map<string, SnapshotRow>()
  let sourceRowCount = 0
  let duplicateRowCount = 0

  for (const inputPath of inputPaths) {
    sourceRowCount += await readSnapshotCsvFile(inputPath, (row, rowLabel) => {
      const addressKey = row.address.toLowerCase()
      const existingRow = rowsByAddress.get(addressKey)

      if (existingRow) {
        try {
          mergeSnapshotRows(existingRow, row)
        } catch (error) {
          throw new SnapshotPipelineError(
            `${getErrorMessage(error)} at ${rowLabel}`,
            { cause: error },
          )
        }
        duplicateRowCount += 1
        return
      }

      rowsByAddress.set(addressKey, row)
    })
  }

  if (rowsByAddress.size === 0) {
    throw new SnapshotPipelineError(
      'The snapshot CSVs did not contain any eligible addresses',
    )
  }

  const rows = [...rowsByAddress.values()].sort(compareAddresses)

  return {
    duplicateRowCount,
    rows,
    sourceRowCount,
  }
}

export const createEligibility = (
  row: SnapshotRow,
  proof: readonly Hex[],
): CommemorativeNftEligibility => ({
  address: row.address,
  name: row.rendererName,
  profileName: row.profileName,
  rendererName: row.rendererName,
  tokenId: getCommemorativeNftTokenId(row.address),
  proof,
  traits: row.traits,
  attributes: getRendererAttributes(row.traits),
})

export const createRenderInput = (
  row: SnapshotRow,
): CommemorativeNftRenderInput => ({
  name: row.rendererName,
  description: COMMEMORATIVE_NFT_DESCRIPTION,
  image: '',
  animation_url: '',
  attributes: getRendererAttributes(row.traits),
})

const JSON_ESCAPE_VALUES: Readonly<Record<string, string>> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

export const serializeJson = (value: unknown): string => {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new SnapshotPipelineError('Cannot serialize an undefined artifact')
  }

  return `${serialized.replace(
    /[<>&\u2028\u2029]/g,
    (character) => JSON_ESCAPE_VALUES[character] ?? character,
  )}\n`
}

const createJsonArtifact = (key: string, value: unknown): Artifact => ({
  body: serializeJson(value),
  cacheControl: IMMUTABLE_CACHE_CONTROL,
  contentType: JSON_CONTENT_TYPE,
  key,
})

const writeArtifact = async (
  writers: readonly ArtifactWriter[],
  artifact: Artifact,
): Promise<void> => {
  await Promise.all(writers.map((writer) => writer.write(artifact)))
}

const writeInBatches = async <Value>(
  values: Iterable<Value>,
  concurrency: number,
  operation: (value: Value) => Promise<void>,
): Promise<void> => {
  if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
    throw new SnapshotPipelineError(
      'Write concurrency must be a positive integer',
    )
  }

  let batch: Value[] = []
  for (const value of values) {
    batch.push(value)
    if (batch.length < concurrency) continue

    await Promise.all(batch.map((batchValue) => operation(batchValue)))
    batch = []
  }

  await Promise.all(batch.map((value) => operation(value)))
}

const normalizeExpectedRoot = (value: string): Hex => {
  if (!EXPECTED_ROOT_PATTERN.test(value)) {
    throw new SnapshotPipelineError(
      'Expected root must be a 32-byte 0x-prefixed hex value',
    )
  }

  return value.toLowerCase() as Hex
}

export const generateSnapshotArtifacts = async (params: {
  readonly snapshot: LoadedSnapshot
  readonly writers: readonly ArtifactWriter[]
  readonly concurrency?: number
  readonly expectedRoot?: string
}): Promise<{
  readonly addressCount: number
  readonly root: Hex
}> => {
  if (params.writers.length === 0) {
    throw new SnapshotPipelineError('At least one artifact writer is required')
  }

  const sortedRows = [...params.snapshot.rows].sort(compareAddresses)
  const tree = StandardMerkleTree.of(
    sortedRows.map((row) => [row.address]),
    ['address'],
  )
  const root = tree.root as Hex
  const expectedRoot = params.expectedRoot
    ? normalizeExpectedRoot(params.expectedRoot)
    : undefined

  if (expectedRoot && expectedRoot !== root.toLowerCase()) {
    throw new SnapshotPipelineError(
      `Merkle root mismatch: expected ${expectedRoot}, generated ${root}`,
    )
  }

  const rowsByAddress = new Map(
    sortedRows.map((row) => [row.address.toLowerCase(), row]),
  )
  await writeInBatches(
    tree.entries(),
    params.concurrency ?? DEFAULT_WRITE_CONCURRENCY,
    async ([index, [rawAddress]]) => {
      const address = getAddress(rawAddress)
      const row = rowsByAddress.get(address.toLowerCase())
      if (!row) {
        throw new SnapshotPipelineError(
          `Merkle tree contains an unknown address: ${address}`,
        )
      }

      const proof = tree.getProof(index) as readonly Hex[]
      const tokenId = getCommemorativeNftTokenId(address)

      await Promise.all([
        writeArtifact(
          params.writers,
          createJsonArtifact(
            getEligibilityKey(address),
            createEligibility(row, proof),
          ),
        ),
        writeArtifact(
          params.writers,
          createJsonArtifact(
            getRenderInputKey(tokenId),
            createRenderInput(row),
          ),
        ),
      ])
    },
  )

  const manifest: PipelineManifest = {
    schemaVersion: PIPELINE_MANIFEST_SCHEMA_VERSION,
    eligibleAddressCount: params.snapshot.rows.length,
    sourceRowCount: params.snapshot.sourceRowCount,
    duplicateRowCount: params.snapshot.duplicateRowCount,
    merkleRoot: root,
    seedDerivation: SEED_DERIVATION,
    eligibilityKeyFormat: 'eligibility/<lowercase-address>.json',
    renderInputKeyFormat: 'render-input/<decimal-token-id>.json',
  }

  await writeArtifact(params.writers, {
    body: `${root}\n`,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    contentType: TEXT_CONTENT_TYPE,
    key: 'root.txt',
  })
  // The manifest is intentionally written last and acts as the completion
  // marker for a fully generated/uploaded dataset.
  await writeArtifact(
    params.writers,
    createJsonArtifact('manifest.json', manifest),
  )

  return {
    addressCount: params.snapshot.rows.length,
    root,
  }
}
