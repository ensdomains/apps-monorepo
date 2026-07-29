import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type createEligibility,
  type createRenderInput,
  generateSnapshotArtifacts,
  loadSnapshotCsvFiles,
  mapSnapshotCsvRecord,
  SnapshotPipelineError,
  serializeJson,
} from './pipeline'
import type { Artifact, ArtifactWriter, LoadedSnapshot } from './types'

const temporaryFiles: string[] = []
const FIXTURE_PATH = join(
  process.cwd(),
  'fixtures/commemorative-nft/sample-snapshot.csv',
)
const FIXTURE_ROOT =
  '0xae6afff7b7c4d883d5efd44afa0b98e80317697e8984b4c2de7c54b49c1c4dd4'
const SEPOLIA_FIXTURE_PATH = join(
  process.cwd(),
  'fixtures/commemorative-nft-sepolia.csv',
)
const SEPOLIA_FIXTURE_ROOT =
  '0xdf3b19d887bceb97c681618cb29e9ae6fe540599eec7567ef24586d444c02260'

const createTemporaryCsv = async (contents: string): Promise<string> => {
  const filePath = join(tmpdir(), `nft-snapshot-${crypto.randomUUID()}.csv`)
  temporaryFiles.push(filePath)
  await writeFile(filePath, contents)
  return filePath
}

const createMemoryWriter = (): {
  readonly artifacts: Map<string, Artifact>
  readonly order: string[]
  readonly writer: ArtifactWriter
} => {
  const artifacts = new Map<string, Artifact>()
  const order: string[] = []

  return {
    artifacts,
    order,
    writer: {
      write: async (artifact) => {
        if (artifacts.has(artifact.key)) {
          throw new Error(`Duplicate artifact: ${artifact.key}`)
        }
        artifacts.set(artifact.key, artifact)
        order.push(artifact.key)
      },
    },
  }
}

const requiredArtifact = (
  artifacts: ReadonlyMap<string, Artifact>,
  key: string,
): Artifact => {
  const artifact = artifacts.get(key)
  if (!artifact) throw new Error(`Missing test artifact: ${key}`)
  return artifact
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(
    temporaryFiles.splice(0).map((filePath) => rm(filePath, { force: true })),
  )
})

describe('snapshot CSV loading', () => {
  it('streams quoted values, hostile names, and identical duplicates', async () => {
    const snapshot = await loadSnapshotCsvFiles([FIXTURE_PATH])

    expect(snapshot.sourceRowCount).toBe(4)
    expect(snapshot.duplicateRowCount).toBe(1)
    expect(snapshot.rows).toHaveLength(3)
    expect(snapshot.rows.map(({ profileName }) => profileName)).toEqual([
      'yoginth.eth',
      'alpha, beta.eth',
      '<img src=x onerror="alert(1)">.eth',
    ])
  })

  it('uses primary, oldest, then fallback name in that order', () => {
    const baseRecord = {
      current_owner: '0x1234567890123456789012345678901234567890',
      primary_name: 'primary.eth',
      oldest_name: 'oldest.eth',
      name: 'fallback.eth',
      genesis_era: 'DeFi Summer',
      collection_depth: 'Namer',
      gas_veteran: 'Seasoned',
      name_archetype: 'Common Noun',
    }

    expect(mapSnapshotCsvRecord(baseRecord).profileName).toBe('primary.eth')
    expect(
      mapSnapshotCsvRecord({ ...baseRecord, primary_name: '' }).profileName,
    ).toBe('oldest.eth')
    expect(
      mapSnapshotCsvRecord({
        ...baseRecord,
        primary_name: '',
        oldest_name: '',
      }).profileName,
    ).toBe('fallback.eth')
  })

  it('deduplicates identical addresses across snapshot windows', async () => {
    const header =
      'current_owner,primary_name,oldest_name,name,genesis_era,collection_depth,gas_veteran,name_archetype\n'
    const row =
      '0x1111111111111111111111111111111111111111,first.eth,,,DeFi Summer,Namer,Seasoned,Common Noun\n'
    const firstWindow = await createTemporaryCsv(`${header}${row}`)
    const secondWindow = await createTemporaryCsv(`${header}${row}`)

    await expect(
      loadSnapshotCsvFiles([firstWindow, secondWindow]),
    ).resolves.toMatchObject({
      duplicateRowCount: 1,
      sourceRowCount: 2,
      rows: [{ profileName: 'first.eth' }],
    })
  })

  it('rejects conflicting rows for the same lowercase address', async () => {
    const csv =
      await createTemporaryCsv(`current_owner,primary_name,oldest_name,name,genesis_era,collection_depth,gas_veteran,name_archetype
0x1111111111111111111111111111111111111111,first.eth,,,DeFi Summer,Namer,Seasoned,Common Noun
0x1111111111111111111111111111111111111111,second.eth,,,DeFi Summer,Namer,Seasoned,Common Noun
`)

    await expect(loadSnapshotCsvFiles([csv])).rejects.toThrow(
      'Conflicting snapshot rows',
    )
  })

  it('reports invalid required values with file and row context', async () => {
    const csv =
      await createTemporaryCsv(`current_owner,primary_name,oldest_name,name,genesis_era,collection_depth,gas_veteran,name_archetype
not-an-address,test.eth,,,DeFi Summer,Namer,Seasoned,Common Noun
`)

    await expect(loadSnapshotCsvFiles([csv])).rejects.toThrow(`${csv}:2`)
  })

  it('rejects an empty snapshot', async () => {
    const csv = await createTemporaryCsv(
      'current_owner,primary_name,oldest_name,name,genesis_era,collection_depth,gas_veteran,name_archetype\n',
    )

    await expect(loadSnapshotCsvFiles([csv])).rejects.toThrow(
      'did not contain any eligible addresses',
    )
  })
})

describe('snapshot artifact generation', () => {
  it('reproduces the reviewed three-address Sepolia fixture root', async () => {
    const snapshot = await loadSnapshotCsvFiles([SEPOLIA_FIXTURE_PATH])
    const memory = createMemoryWriter()
    const result = await generateSnapshotArtifacts({
      snapshot,
      writers: [memory.writer],
      expectedRoot: SEPOLIA_FIXTURE_ROOT,
    })

    expect(snapshot.rows).toHaveLength(3)
    expect(result.root).toBe(SEPOLIA_FIXTURE_ROOT)
  })

  it('creates verifiable proofs, render inputs, manifest, and root', async () => {
    const snapshot = await loadSnapshotCsvFiles([FIXTURE_PATH])
    const memory = createMemoryWriter()
    const result = await generateSnapshotArtifacts({
      snapshot,
      writers: [memory.writer],
    })

    expect(result.addressCount).toBe(3)
    expect(result.root).toBe(FIXTURE_ROOT)
    expect(memory.artifacts).toHaveLength(8)
    expect(memory.order.at(-1)).toBe('manifest.json')

    const firstRow = snapshot.rows[0]
    if (!firstRow) throw new Error('Fixture row is missing')
    const eligibilityKey = `eligibility/${firstRow.address.toLowerCase()}.json`
    const eligibility = JSON.parse(
      requiredArtifact(memory.artifacts, eligibilityKey).body,
    ) as ReturnType<typeof createEligibility>
    const renderInput = JSON.parse(
      requiredArtifact(
        memory.artifacts,
        `render-input/${eligibility.tokenId}.json`,
      ).body,
    ) as ReturnType<typeof createRenderInput>

    expect(
      StandardMerkleTree.verify(
        result.root,
        ['address'],
        [eligibility.address],
        [...eligibility.proof],
      ),
    ).toBe(true)
    expect(renderInput.name).toBe(eligibility.rendererName)
    expect(renderInput.attributes).toEqual(eligibility.attributes)
    expect(requiredArtifact(memory.artifacts, 'root.txt').body).toBe(
      `${result.root}\n`,
    )

    const manifest = JSON.parse(
      requiredArtifact(memory.artifacts, 'manifest.json').body,
    ) as {
      readonly duplicateRowCount: number
      readonly eligibleAddressCount: number
      readonly merkleRoot: string
      readonly sourceRowCount: number
    }
    expect(manifest).toMatchObject({
      duplicateRowCount: 1,
      eligibleAddressCount: 3,
      merkleRoot: result.root,
      sourceRowCount: 4,
    })
  })

  it('escapes hostile JSON characters while preserving parsed values', async () => {
    const snapshot = await loadSnapshotCsvFiles([FIXTURE_PATH])
    const memory = createMemoryWriter()
    await generateSnapshotArtifacts({
      snapshot,
      writers: [memory.writer],
    })

    const hostileArtifact = [...memory.artifacts.values()].find(
      ({ key }) =>
        key.startsWith('eligibility/') &&
        JSON.parse(memory.artifacts.get(key)?.body ?? '{}').profileName ===
          '<img src=x onerror="alert(1)">.eth',
    )
    if (!hostileArtifact) throw new Error('Hostile fixture artifact is missing')

    expect(hostileArtifact.body).not.toContain('<img')
    expect(JSON.parse(hostileArtifact.body).profileName).toBe(
      '<img src=x onerror="alert(1)">.eth',
    )
    expect(JSON.parse(serializeJson({ value: '<>&\u2028\u2029' }))).toEqual({
      value: '<>&\u2028\u2029',
    })
  })

  it('is deterministic regardless of source row order', async () => {
    const snapshot = await loadSnapshotCsvFiles([FIXTURE_PATH])
    const reversedSnapshot: LoadedSnapshot = {
      ...snapshot,
      rows: [...snapshot.rows].reverse(),
    }
    const first = createMemoryWriter()
    const second = createMemoryWriter()

    const firstResult = await generateSnapshotArtifacts({
      snapshot,
      writers: [first.writer],
    })
    const secondResult = await generateSnapshotArtifacts({
      snapshot: reversedSnapshot,
      writers: [second.writer],
    })

    expect(secondResult.root).toBe(firstResult.root)
    expect([...second.artifacts]).toEqual([...first.artifacts])
  })

  it('checks an expected root before writing any artifacts', async () => {
    const snapshot = await loadSnapshotCsvFiles([FIXTURE_PATH])
    const memory = createMemoryWriter()

    await expect(
      generateSnapshotArtifacts({
        snapshot,
        writers: [memory.writer],
        expectedRoot: `0x${'00'.repeat(32)}`,
      }),
    ).rejects.toBeInstanceOf(SnapshotPipelineError)
    expect(memory.artifacts).toHaveLength(0)
  })

  it('rejects an invalid expected root and write concurrency', async () => {
    const snapshot = await loadSnapshotCsvFiles([FIXTURE_PATH])

    await expect(
      generateSnapshotArtifacts({
        snapshot,
        writers: [createMemoryWriter().writer],
        expectedRoot: '0x1234',
      }),
    ).rejects.toThrow('Expected root must be a 32-byte')
    await expect(
      generateSnapshotArtifacts({
        snapshot,
        writers: [createMemoryWriter().writer],
        concurrency: 0,
      }),
    ).rejects.toThrow('Write concurrency must be a positive integer')
  })
})
