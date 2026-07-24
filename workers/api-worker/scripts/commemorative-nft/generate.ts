#!/usr/bin/env node
import { resolve } from 'node:path'
import {
  assertEmptyOutputDirectory,
  createLocalArtifactWriter,
  generateSnapshotArtifacts,
  loadSnapshotCsvFiles,
} from './pipeline'
import { createR2ArtifactWriter } from './r2Writer'

const readFlag = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const readRepeatedFlag = (name: string): readonly string[] =>
  process.argv.flatMap((value, index) =>
    value === name && process.argv[index + 1] ? [process.argv[index + 1]] : [],
  )

const requiredEnvironmentValue = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required when --upload is used`)
  return value
}

const inputPaths = readRepeatedFlag('--input').map((path) => resolve(path))
const outputDirectory = resolve(readFlag('--out') ?? 'commemorative-nft-out')
const expectedRoot = readFlag('--expected-root') as `0x${string}` | undefined
const shouldUpload = process.argv.includes('--upload')

if (inputPaths.length === 0) {
  throw new Error(
    'Usage: pnpm nft:pipeline --input <snapshot.csv> [--input <window2.csv>] [--out <directory>] [--expected-root <0x...>] [--upload]',
  )
}

await assertEmptyOutputDirectory(outputDirectory)
const rows = await loadSnapshotCsvFiles(inputPaths)
const writers = [createLocalArtifactWriter(outputDirectory)]

if (shouldUpload) {
  writers.push(
    createR2ArtifactWriter({
      accountId: requiredEnvironmentValue('R2_ACCOUNT_ID'),
      accessKeyId: requiredEnvironmentValue('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnvironmentValue('R2_SECRET_ACCESS_KEY'),
      bucketName:
        process.env.R2_BUCKET_NAME?.trim() || 'ensv2-commemorative-nft-staging',
    }),
  )
}

const result = await generateSnapshotArtifacts({
  rows,
  writers,
  expectedRoot,
})

console.log(`Addresses: ${result.count}`)
console.log(`Root:      ${result.root}`)
console.log(`Output:    ${outputDirectory}`)
if (shouldUpload) console.log('R2 upload complete')
