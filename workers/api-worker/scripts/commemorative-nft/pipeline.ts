import { createReadStream } from 'node:fs'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { parse } from 'csv-parse'
import { type Address, getAddress } from 'viem'
import { COMMEMORATIVE_NFT_DESCRIPTION } from '../../src/services/commemorative-nft/constants'
import {
  getCommemorativeNftTokenId,
  getEligibilityKey,
  getRenderInputKey,
} from '../../src/services/commemorative-nft/keys'
import {
  getRendererAttributes,
  getRendererName,
  mapRendererTraits,
  normalizeProfileName,
} from '../../src/services/commemorative-nft/traits'
import type {
  CommemorativeNftEligibility,
  CommemorativeNftRenderInput,
  RendererTraits,
} from '../../src/services/commemorative-nft/types'

export type SnapshotRow = {
  readonly address: Address
  readonly profileName: string
  readonly rendererName: string
  readonly traits: RendererTraits
}

type CsvRecord = Readonly<Record<string, string>>

export type ArtifactWriter = {
  readonly includeTreeDump?: boolean
  readonly write: (key: string, value: string) => Promise<void>
}

const CSV_OPTIONS = {
  bom: true,
  columns: true,
  relax_column_count: false,
  skip_empty_lines: true,
  skip_records_with_empty_values: false,
  trim: true,
} as const

const requiredValue = (
  record: CsvRecord,
  column: string,
  rowNumber?: number,
): string => {
  const value = record[column]?.trim()
  if (value) return value

  const rowLabel = rowNumber === undefined ? '' : ` on row ${rowNumber}`
  throw new Error(`Missing required "${column}"${rowLabel}`)
}

export const mapSnapshotCsvRecord = (
  record: CsvRecord,
  rowNumber?: number,
): SnapshotRow => {
  const address = getAddress(requiredValue(record, 'current_owner', rowNumber))
  const primaryName = record.primary_name?.trim()
  const oldestName = record.oldest_name?.trim()
  const profileName = normalizeProfileName(
    primaryName || oldestName || requiredValue(record, 'name', rowNumber),
  )
  const rendererName = getRendererName(profileName)

  return {
    address,
    profileName,
    rendererName,
    traits: mapRendererTraits({
      // The delivered export headers were corrected at the source. Do not
      // reintroduce the old gas_veteran/genesis_era compensation here.
      genesisEra: requiredValue(record, 'genesis_era', rowNumber),
      collectionDepth: requiredValue(record, 'collection_depth', rowNumber),
      gasVeteran: record.gas_veteran ?? '',
      nameArchetype: requiredValue(record, 'name_archetype', rowNumber),
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
    throw new Error(
      `Conflicting snapshot rows for ${existing.address.toLowerCase()}`,
    )
  }
  return existing
}

export const loadSnapshotCsvFiles = async (
  inputPaths: readonly string[],
): Promise<readonly SnapshotRow[]> => {
  const rowsByAddress = new Map<string, SnapshotRow>()
  let rowNumber = 1

  for (const inputPath of inputPaths) {
    const parser = createReadStream(inputPath).pipe(parse(CSV_OPTIONS))

    for await (const rawRecord of parser) {
      rowNumber += 1
      const record = rawRecord as CsvRecord
      const row = mapSnapshotCsvRecord(record, rowNumber)
      const key = row.address.toLowerCase()
      const existing = rowsByAddress.get(key)
      rowsByAddress.set(key, existing ? mergeSnapshotRows(existing, row) : row)
    }
  }

  if (rowsByAddress.size === 0) {
    throw new Error('The snapshot CSVs did not contain any eligible addresses')
  }

  return [...rowsByAddress.values()]
}

export const createEligibility = (
  row: SnapshotRow,
  proof: readonly `0x${string}`[],
): CommemorativeNftEligibility => {
  const tokenId = getCommemorativeNftTokenId(row.address)
  return {
    address: row.address,
    name: row.rendererName,
    profileName: row.profileName,
    rendererName: row.rendererName,
    tokenId,
    proof,
    traits: row.traits,
    attributes: getRendererAttributes(row.traits),
  }
}

export const createRenderInput = (
  row: SnapshotRow,
): CommemorativeNftRenderInput => ({
  name: row.rendererName,
  description: COMMEMORATIVE_NFT_DESCRIPTION,
  image: '',
  animation_url: '',
  attributes: getRendererAttributes(row.traits),
})

const writeJson = (
  writer: ArtifactWriter,
  key: string,
  value: unknown,
): Promise<void> => writer.write(key, JSON.stringify(value))

const writeInBatches = async <Value>(
  values: readonly Value[],
  concurrency: number,
  operation: (value: Value) => Promise<void>,
): Promise<void> => {
  for (let offset = 0; offset < values.length; offset += concurrency) {
    await Promise.all(
      values
        .slice(offset, offset + concurrency)
        .map((value) => operation(value)),
    )
  }
}

export const createLocalArtifactWriter = (
  outputDirectory: string,
): ArtifactWriter => ({
  includeTreeDump: true,
  write: async (key, value) => {
    const path = join(outputDirectory, key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, value)
  },
})

export const assertEmptyOutputDirectory = async (
  outputDirectory: string,
): Promise<void> => {
  try {
    if (!(await stat(outputDirectory)).isDirectory()) {
      throw new Error(`${outputDirectory} exists and is not a directory`)
    }
    if ((await readdir(outputDirectory)).length > 0) {
      throw new Error(`${outputDirectory} must be empty`)
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      await mkdir(outputDirectory, { recursive: true })
      return
    }
    throw error
  }
}

export const generateSnapshotArtifacts = async (params: {
  readonly concurrency?: number
  readonly expectedRoot?: `0x${string}`
  readonly rows: readonly SnapshotRow[]
  readonly writers: readonly ArtifactWriter[]
}): Promise<{ readonly count: number; readonly root: `0x${string}` }> => {
  const rowsByAddress = new Map(
    params.rows.map((row) => [row.address.toLowerCase(), row]),
  )
  const tree = StandardMerkleTree.of(
    params.rows.map((row) => [row.address]),
    ['address'],
  )
  const root = tree.root as `0x${string}`

  if (
    params.expectedRoot &&
    params.expectedRoot.toLowerCase() !== root.toLowerCase()
  ) {
    throw new Error(
      `Merkle root mismatch: expected ${params.expectedRoot}, generated ${root}`,
    )
  }

  const entries = [...tree.entries()]
  await writeInBatches(
    entries,
    params.concurrency ?? 32,
    async ([index, [rawAddress]]) => {
      const address = getAddress(rawAddress)
      const row = rowsByAddress.get(address.toLowerCase())
      if (!row) throw new Error(`Missing source row for ${address}`)

      const eligibility = createEligibility(
        row,
        tree.getProof(index) as readonly `0x${string}`[],
      )
      const renderInput = createRenderInput(row)
      const tokenId = getCommemorativeNftTokenId(address)

      await Promise.all(
        params.writers.flatMap((writer) => [
          writeJson(writer, getEligibilityKey(address), eligibility),
          writeJson(writer, getRenderInputKey(tokenId), renderInput),
        ]),
      )
    },
  )

  const manifest = {
    schemaVersion: 1,
    addressCount: params.rows.length,
    merkleRoot: root,
    seedDerivation: 'uint32(keccak256("seed:" + lowercaseRendererName))',
  }

  await Promise.all(
    params.writers.flatMap((writer) => {
      const publicArtifacts = [
        writer.write('manifest.json', JSON.stringify(manifest)),
        writer.write('root.txt', `${root}\n`),
      ]
      return writer.includeTreeDump
        ? [
            ...publicArtifacts,
            writer.write('tree.json', JSON.stringify(tree.dump())),
          ]
        : publicArtifacts
    }),
  )

  return { count: params.rows.length, root }
}
