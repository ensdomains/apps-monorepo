#!/usr/bin/env node
import { parsePipelineCliOptions, readR2UploadConfiguration } from './cli'
import { generateSnapshotArtifacts, loadSnapshotCsvFiles } from './pipeline'
import {
  assertEmptyOutputDirectory,
  createLocalArtifactWriter,
  createR2ArtifactWriter,
} from './writers'

const run = async (): Promise<void> => {
  const options = parsePipelineCliOptions(process.argv.slice(2))
  const r2Writer = options.shouldUpload
    ? createR2ArtifactWriter(readR2UploadConfiguration(process.env))
    : undefined
  const snapshot = await loadSnapshotCsvFiles(options.inputPaths)

  await assertEmptyOutputDirectory(options.outputDirectory)
  const writers = [createLocalArtifactWriter(options.outputDirectory)]

  if (r2Writer) writers.push(r2Writer)

  const result = await generateSnapshotArtifacts({
    snapshot,
    writers,
    concurrency: options.concurrency,
    expectedRoot: options.expectedRoot,
  })

  console.log(`Source rows:       ${snapshot.sourceRowCount}`)
  console.log(`Duplicate rows:    ${snapshot.duplicateRowCount}`)
  console.log(`Eligible addresses: ${result.addressCount}`)
  console.log(`Merkle root:       ${result.root}`)
  console.log(`Local output:      ${options.outputDirectory}`)
  console.log(
    options.shouldUpload
      ? 'R2 upload:         complete'
      : 'R2 upload:         skipped (local dry run)',
  )
}

try {
  await run()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
