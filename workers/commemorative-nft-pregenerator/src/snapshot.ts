import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { parse } from 'csv-parse'
import { type Address, getAddress, type Hex } from 'viem'
import { NAME_CODE_POINT_THRESHOLDS } from './constants.js'
import { getCommemorativeNftTokenId } from './metadata.js'
import {
  looksLikeLegacySwappedTraitColumns,
  mapRendererTraits,
  selectSnapshotName,
} from './traits.js'
import type {
  BuiltSnapshotMerkleTree,
  LoadedSnapshot,
  SelectedSnapshotName,
  SnapshotAnomalyStats,
  SnapshotRow,
  SnapshotSource,
  SnapshotStats,
} from './types.js'

export type SnapshotCsvRecord = Readonly<Record<string, string>>

type CandidateGroup = {
  winner: SnapshotRow
  readonly firstFingerprint: string
  hasConflict: boolean
  sourceCount: number
  maximumDaysHeld: number
  maximumDaysHeldRowCount: number
  maximumDaysHeldFingerprint: string
  hasConflictingMaximumDaysHeldRows: boolean
}

type DeduplicationCounts = {
  duplicateRowCount: number
  duplicateAddressCount: number
  conflictingDuplicateAddressCount: number
}

const CSV_OPTIONS = {
  bom: true,
  columns: true,
  relax_column_count: false,
  skip_empty_lines: true,
  skip_records_with_empty_values: false,
  trim: true,
} as const

const EXPECTED_ROOT_PATTERN = /^0x[0-9a-fA-F]{64}$/
const REQUIRED_COLUMNS = [
  'oldest_name',
  'current_owner',
  'days_held',
  'genesis_era',
  'gas_veteran',
  'collection_depth',
  'name_archetype',
  'snapshot_window',
  'primary_name',
] as const

export class SnapshotError extends Error {
  override readonly name = 'SnapshotError'
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const parseCsvRecord = (value: unknown): SnapshotCsvRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SnapshotError('CSV parser returned a non-object record')
  }

  const entries = Object.entries(value)
  if (!entries.every(([, entryValue]) => typeof entryValue === 'string')) {
    throw new SnapshotError('CSV record contains a non-string value')
  }

  return Object.fromEntries(entries) as Record<string, string>
}

const assertRequiredColumns = (
  record: SnapshotCsvRecord,
  rowLabel: string,
): void => {
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !Object.hasOwn(record, column),
  )
  if (missingColumns.length === 0) return

  throw new SnapshotError(
    `Missing required CSV column${missingColumns.length === 1 ? '' : 's'} at ${rowLabel}: ${missingColumns.join(', ')}`,
  )
}

const requiredValue = (
  record: SnapshotCsvRecord,
  column: string,
  rowLabel: string,
): string => {
  const value = record[column]?.trim()
  if (value) return value
  throw new SnapshotError(`Missing required "${column}" at ${rowLabel}`)
}

const parseAddress = (value: string, rowLabel: string): Address => {
  try {
    return getAddress(value)
  } catch (error) {
    throw new SnapshotError(
      `Invalid "current_owner" at ${rowLabel}: ${getErrorMessage(error)}`,
      { cause: error },
    )
  }
}

const parseDaysHeld = (value: string, rowLabel: string): number => {
  const daysHeld = Number(value)
  if (!Number.isFinite(daysHeld) || daysHeld < 0) {
    throw new SnapshotError(
      `Invalid numeric "days_held" at ${rowLabel}: ${value}`,
    )
  }
  return daysHeld
}

const rendererFingerprint = (row: SnapshotRow): string =>
  JSON.stringify({
    profileName: row.profileName,
    rendererName: row.rendererName,
    traits: row.traits,
  })

const windowPriority = (snapshotWindow: string): number =>
  snapshotWindow.toLocaleLowerCase('en-US') === 'win1' ? 0 : 1

const shouldReplaceWinner = (
  existing: SnapshotRow,
  incoming: SnapshotRow,
): boolean => {
  if (incoming.daysHeld !== existing.daysHeld) {
    return incoming.daysHeld > existing.daysHeld
  }

  const existingWindowPriority = windowPriority(existing.snapshotWindow)
  const incomingWindowPriority = windowPriority(incoming.snapshotWindow)
  if (incomingWindowPriority !== existingWindowPriority) {
    return incomingWindowPriority < existingWindowPriority
  }

  return incoming.sourceOrder < existing.sourceOrder
}

const createCandidateGroup = (
  row: SnapshotRow,
  fingerprint: string,
): CandidateGroup => ({
  winner: row,
  firstFingerprint: fingerprint,
  hasConflict: false,
  sourceCount: 1,
  maximumDaysHeld: row.daysHeld,
  maximumDaysHeldRowCount: 1,
  maximumDaysHeldFingerprint: fingerprint,
  hasConflictingMaximumDaysHeldRows: false,
})

const updateMaximumDaysHeldRows = (
  group: CandidateGroup,
  row: SnapshotRow,
  fingerprint: string,
): void => {
  if (row.daysHeld > group.maximumDaysHeld) {
    group.maximumDaysHeld = row.daysHeld
    group.maximumDaysHeldRowCount = 1
    group.maximumDaysHeldFingerprint = fingerprint
    group.hasConflictingMaximumDaysHeldRows = false
    return
  }

  if (row.daysHeld !== group.maximumDaysHeld) return
  group.maximumDaysHeldRowCount += 1
  if (fingerprint !== group.maximumDaysHeldFingerprint) {
    group.hasConflictingMaximumDaysHeldRows = true
  }
}

const addCandidateRow = (params: {
  readonly groupsByAddress: Map<string, CandidateGroup>
  readonly counts: DeduplicationCounts
  readonly row: SnapshotRow
}): void => {
  const addressKey = params.row.address.toLowerCase()
  const fingerprint = rendererFingerprint(params.row)
  const group = params.groupsByAddress.get(addressKey)
  if (!group) {
    params.groupsByAddress.set(
      addressKey,
      createCandidateGroup(params.row, fingerprint),
    )
    return
  }

  params.counts.duplicateRowCount += 1
  group.sourceCount += 1
  if (group.sourceCount === 2) params.counts.duplicateAddressCount += 1
  if (!group.hasConflict && fingerprint !== group.firstFingerprint) {
    group.hasConflict = true
    params.counts.conflictingDuplicateAddressCount += 1
  }

  updateMaximumDaysHeldRows(group, params.row, fingerprint)
  if (shouldReplaceWinner(group.winner, params.row)) group.winner = params.row
}

const compareAddresses = (left: SnapshotRow, right: SnapshotRow): number => {
  const leftAddress = left.address.toLowerCase()
  const rightAddress = right.address.toLowerCase()
  if (leftAddress === rightAddress) return 0
  return leftAddress < rightAddress ? -1 : 1
}

export const mapSnapshotCsvRecord = (
  record: SnapshotCsvRecord,
  params: {
    readonly legacySwappedTraitColumns: boolean
    readonly sourcePath: string
    readonly sourceFileIndex: number
    readonly sourceRowNumber: number
    readonly sourceOrder: number
  },
): SnapshotRow => {
  const rowLabel = `${params.sourcePath}:${params.sourceRowNumber}`
  assertRequiredColumns(record, rowLabel)

  const rawGenesisEra = record.genesis_era ?? ''
  const rawGasVeteran = record.gas_veteran ?? ''
  if (
    !params.legacySwappedTraitColumns &&
    looksLikeLegacySwappedTraitColumns({
      genesisEra: rawGenesisEra,
      gasVeteran: rawGasVeteran,
    })
  ) {
    throw new SnapshotError(
      `The genesis_era and gas_veteran values appear semantically swapped at ${rowLabel}; rerun with legacySwappedTraitColumns: true only for the legacy BigQuery exports`,
    )
  }

  let selectedName: SelectedSnapshotName
  try {
    selectedName = selectSnapshotName({
      primaryName: record.primary_name,
      oldestName: record.oldest_name,
    })
  } catch (error) {
    throw new SnapshotError(
      `Invalid display name at ${rowLabel}: ${getErrorMessage(error)}`,
      { cause: error },
    )
  }
  const address = parseAddress(
    requiredValue(record, 'current_owner', rowLabel),
    rowLabel,
  )
  const genesisEra = params.legacySwappedTraitColumns
    ? rawGasVeteran
    : rawGenesisEra
  const gasVeteran = params.legacySwappedTraitColumns
    ? rawGenesisEra
    : rawGasVeteran

  try {
    return {
      address,
      tokenId: getCommemorativeNftTokenId(address),
      profileName: selectedName.profileName,
      rendererName: selectedName.rendererName,
      displayNameSource: selectedName.source,
      daysHeld: parseDaysHeld(
        requiredValue(record, 'days_held', rowLabel),
        rowLabel,
      ),
      snapshotWindow: requiredValue(record, 'snapshot_window', rowLabel)
        .normalize('NFC')
        .toLocaleLowerCase('en-US'),
      traits: mapRendererTraits({
        genesisEra,
        collectionDepth: requiredValue(record, 'collection_depth', rowLabel),
        gasVeteran,
        nameArchetype: requiredValue(record, 'name_archetype', rowLabel),
        rendererName: selectedName.rendererName,
      }),
      sourcePath: params.sourcePath,
      sourceFileIndex: params.sourceFileIndex,
      sourceRowNumber: params.sourceRowNumber,
      sourceOrder: params.sourceOrder,
    }
  } catch (error) {
    if (error instanceof SnapshotError) throw error
    throw new SnapshotError(
      `Invalid snapshot row at ${rowLabel}: ${getErrorMessage(error)}`,
      { cause: error },
    )
  }
}

const readSnapshotCsvFile = async (params: {
  readonly inputPath: string
  readonly sourceFileIndex: number
  readonly legacySwappedTraitColumns: boolean
  readonly firstSourceOrder: number
  readonly onRow: (row: SnapshotRow) => void
}): Promise<SnapshotSource> => {
  const hash = createHash('sha256')
  const source = createReadStream(params.inputPath)
  source.on('data', (chunk: string | Buffer) => {
    hash.update(chunk)
  })
  const parser = source.pipe(parse(CSV_OPTIONS))
  let sourceRowCount = 0
  let sourceRowNumber = 1

  try {
    for await (const rawRecord of parser) {
      sourceRowCount += 1
      sourceRowNumber += 1
      const record = parseCsvRecord(rawRecord)
      params.onRow(
        mapSnapshotCsvRecord(record, {
          legacySwappedTraitColumns: params.legacySwappedTraitColumns,
          sourcePath: params.inputPath,
          sourceFileIndex: params.sourceFileIndex,
          sourceRowNumber,
          sourceOrder: params.firstSourceOrder + sourceRowCount - 1,
        }),
      )
    }
  } catch (error) {
    if (error instanceof SnapshotError) throw error
    throw new SnapshotError(
      `Failed to read snapshot CSV ${params.inputPath}: ${getErrorMessage(error)}`,
      { cause: error },
    )
  }

  return {
    path: params.inputPath,
    rowCount: sourceRowCount,
    sha256: hash.digest('hex'),
  }
}

const getAnomalyStats = (
  rows: readonly SnapshotRow[],
): SnapshotAnomalyStats => {
  let nonEthPrimaryNameCount = 0
  let longNameCount = 0
  let over255CodePointNameCount = 0
  let over1024CodePointNameCount = 0
  let maximumNameCodePointLength = 0

  for (const row of rows) {
    if (
      row.displayNameSource === 'primary_name' &&
      !/\.eth$/i.test(row.profileName)
    ) {
      nonEthPrimaryNameCount += 1
    }

    const nameLength = Array.from(row.profileName).length
    maximumNameCodePointLength = Math.max(
      maximumNameCodePointLength,
      nameLength,
    )
    if (nameLength > NAME_CODE_POINT_THRESHOLDS.long) longNameCount += 1
    if (nameLength > NAME_CODE_POINT_THRESHOLDS.veryLong) {
      over255CodePointNameCount += 1
    }
    if (nameLength > NAME_CODE_POINT_THRESHOLDS.extreme) {
      over1024CodePointNameCount += 1
    }
  }

  return {
    nonEthPrimaryNameCount,
    longNameCount,
    over255CodePointNameCount,
    over1024CodePointNameCount,
    maximumNameCodePointLength,
  }
}

export const loadSnapshotCsvFiles = async (params: {
  readonly inputPaths: readonly string[]
  readonly legacySwappedTraitColumns: boolean
}): Promise<LoadedSnapshot> => {
  if (params.inputPaths.length === 0) {
    throw new SnapshotError('At least one snapshot CSV is required')
  }

  // A mutable index is intentional: the production snapshot has roughly 500k
  // rows, so retaining every parsed CSV record would waste substantial memory.
  // The adjacent counters are mutated for the same single-pass reason.
  const groupsByAddress = new Map<string, CandidateGroup>()
  const sources: SnapshotSource[] = []
  let sourceRowCount = 0
  const counts: DeduplicationCounts = {
    duplicateRowCount: 0,
    duplicateAddressCount: 0,
    conflictingDuplicateAddressCount: 0,
  }

  for (const [sourceFileIndex, inputPath] of params.inputPaths.entries()) {
    const source = await readSnapshotCsvFile({
      inputPath,
      sourceFileIndex,
      legacySwappedTraitColumns: params.legacySwappedTraitColumns,
      firstSourceOrder: sourceRowCount,
      onRow: (row) => addCandidateRow({ groupsByAddress, counts, row }),
    })
    sources.push(source)
    sourceRowCount += source.rowCount
  }

  if (groupsByAddress.size === 0) {
    throw new SnapshotError(
      'The snapshot CSVs did not contain any eligible addresses',
    )
  }

  const groups = [...groupsByAddress.values()]
  const rows = groups.map((group) => group.winner).sort(compareAddresses)
  const selectedWindowCounts = Object.fromEntries(
    [...new Set(rows.map((row) => row.snapshotWindow))]
      .sort((left, right) => left.localeCompare(right, 'en-US'))
      .map((snapshotWindow) => [
        snapshotWindow,
        rows.filter((row) => row.snapshotWindow === snapshotWindow).length,
      ]),
  )
  const stats: SnapshotStats = {
    sourceRowCount,
    eligibleAddressCount: rows.length,
    duplicateRowCount: counts.duplicateRowCount,
    duplicateAddressCount: counts.duplicateAddressCount,
    conflictingDuplicateAddressCount: counts.conflictingDuplicateAddressCount,
    daysHeldTieAddressCount: groups.filter(
      (group) => group.maximumDaysHeldRowCount > 1,
    ).length,
    conflictingDaysHeldTieAddressCount: groups.filter(
      (group) => group.hasConflictingMaximumDaysHeldRows,
    ).length,
    selectedWindowCounts,
    anomalies: getAnomalyStats(rows),
  }

  return { rows, sources, stats }
}

const normalizeExpectedRoot = (value: string): Hex => {
  if (!EXPECTED_ROOT_PATTERN.test(value)) {
    throw new SnapshotError(
      'Expected root must be a 32-byte 0x-prefixed hex value',
    )
  }
  return value.toLowerCase() as Hex
}

export const buildSnapshotMerkleTree = (params: {
  readonly snapshot: LoadedSnapshot
  readonly expectedRoot?: string
  readonly proofRows?: readonly SnapshotRow[]
}): BuiltSnapshotMerkleTree => {
  if (params.snapshot.rows.length === 0) {
    throw new SnapshotError('Cannot build a Merkle tree without snapshot rows')
  }

  const rows = [...params.snapshot.rows].sort(compareAddresses)
  const tree = StandardMerkleTree.of(
    rows.map((row) => [row.address]),
    ['address'],
  )
  const root = tree.root as Hex
  const expectedRoot = params.expectedRoot
    ? normalizeExpectedRoot(params.expectedRoot)
    : undefined

  if (expectedRoot && expectedRoot !== root.toLowerCase()) {
    throw new SnapshotError(
      `Merkle root mismatch: expected ${expectedRoot}, generated ${root}`,
    )
  }

  const indexesByAddress = new Map<string, number>()
  for (const [index, [rawAddress]] of tree.entries()) {
    const address = getAddress(rawAddress)
    indexesByAddress.set(address.toLowerCase(), index)
  }

  const proofRows = params.proofRows ?? rows
  const proofsByAddress = new Map<string, readonly Hex[]>()
  const entries = proofRows.map((row) => {
    const addressKey = row.address.toLowerCase()
    const index = indexesByAddress.get(addressKey)
    if (index === undefined) {
      throw new SnapshotError(
        `Cannot create a proof for unknown snapshot address ${row.address}`,
      )
    }

    const proof = tree.getProof(index) as readonly Hex[]
    proofsByAddress.set(addressKey, proof)
    return { row, proof }
  })

  return { root, entries, proofsByAddress }
}
