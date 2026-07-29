import { resolve } from 'node:path'

export type PipelineCliOptions = {
  readonly concurrency: number | undefined
  readonly expectedRoot: string | undefined
  readonly inputPaths: readonly string[]
  readonly outputDirectory: string
  readonly shouldUpload: boolean
}

const USAGE =
  'Usage: pnpm nft:pipeline --input <snapshot.csv> [--input <window2.csv>] [--out <directory>] [--concurrency <count>] [--expected-root <0x...>] [--upload]'

const readPositiveInteger = (value: string, flag: string): number => {
  const parsedValue = Number(value)
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return parsedValue
}

export const parsePipelineCliOptions = (
  argv: readonly string[],
): PipelineCliOptions => {
  const inputPaths: string[] = []
  let outputDirectory = resolve('commemorative-nft-out')
  let expectedRoot: string | undefined
  let concurrency: number | undefined
  let shouldUpload = false

  const valueFlagHandlers: Readonly<Record<string, (value: string) => void>> = {
    '--input': (value) => inputPaths.push(resolve(value)),
    '--out': (value) => {
      outputDirectory = resolve(value)
    },
    '--expected-root': (value) => {
      expectedRoot = value
    },
    '--concurrency': (value) => {
      concurrency = readPositiveInteger(value, '--concurrency')
    },
  }

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]

    if (flag === '--help') {
      throw new Error(USAGE)
    }
    if (flag === '--upload') {
      shouldUpload = true
      continue
    }
    const handleValue = valueFlagHandlers[flag]
    if (!handleValue) {
      throw new Error(`Unknown argument: ${flag}\n${USAGE}`)
    }

    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}\n${USAGE}`)
    }
    index += 1
    handleValue(value)
  }

  if (inputPaths.length === 0) {
    throw new Error(`At least one --input is required\n${USAGE}`)
  }
  if (shouldUpload && !expectedRoot) {
    throw new Error('--expected-root is required when --upload is used')
  }

  return {
    concurrency,
    expectedRoot,
    inputPaths,
    outputDirectory,
    shouldUpload,
  }
}

const requiredEnvironmentValue = (
  environment: NodeJS.ProcessEnv,
  name: string,
): string => {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required when --upload is used`)
  return value
}

export const readR2UploadConfiguration = (
  environment: NodeJS.ProcessEnv,
): {
  readonly accessKeyId: string
  readonly accountId: string
  readonly bucketName: string
  readonly secretAccessKey: string
} => ({
  accountId: requiredEnvironmentValue(environment, 'R2_ACCOUNT_ID'),
  accessKeyId: requiredEnvironmentValue(environment, 'R2_ACCESS_KEY_ID'),
  secretAccessKey: requiredEnvironmentValue(
    environment,
    'R2_SECRET_ACCESS_KEY',
  ),
  bucketName: requiredEnvironmentValue(environment, 'R2_BUCKET_NAME'),
})
