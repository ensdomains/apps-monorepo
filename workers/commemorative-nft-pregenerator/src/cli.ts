import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PILOT_ITEM_LIMIT = 100
export const REVIEWED_MERKLE_ROOT =
  '0x203fbd8044e5acb7ef03508bb61cc0c8dfa4475ad178986471d2726db56f8c92'
export const STAGING_R2_ACCOUNT_ID = '15dcc9085cb794bb4f29d3e8177ac880'
export const STAGING_R2_BUCKET_NAME = 'ensv2-commemorative-nft-staging'
export const STAGING_ASSET_ORIGIN =
  'https://pub-43406b099825402eb42ecfb3494a902b.r2.dev'
export const DEFAULT_CAPTURE_RENDERER_ORIGIN = 'https://ens-renderer.pages.dev'
export const DEFAULT_METADATA_RENDERER_ORIGIN = DEFAULT_CAPTURE_RENDERER_ORIGIN
export const PINNED_RENDERER_REVISION =
  'sha256:ea7ce759a4a51a69b4e5365f4c286f44deb58a72c964a7189f02ff92d5a63cba'

const DEFAULT_OUTPUT_DIRECTORY = fileURLToPath(
  new URL('../output', import.meta.url),
)

export type PilotCliOptions = {
  readonly assetOrigin: string
  readonly captureRendererOrigin: string
  readonly chromiumExecutablePath?: string
  readonly concurrency: number
  readonly expectedRoot: string
  readonly externalOrigin?: string
  readonly inputPaths: readonly string[]
  readonly legacySwappedTraitColumns: boolean
  readonly limit: number
  readonly metadataRendererOrigin: string
  readonly offset: number
  readonly outputDirectory: string
  readonly rendererRevision: string
  readonly shouldUpload: boolean
}

const HELP = `Usage: pnpm nft:pregenerate -- --input <snapshot.csv> --input <snapshot.csv> [options]

Generates at most 100 deterministic commemorative NFT PNG/JSON pairs. The full
snapshot is always loaded and checked against the reviewed Merkle root before
the selected pilot slice is rendered.

Required:
  --input <path>                         Snapshot CSV; repeat for each window

Options:
  --output <path>                        Local output (default: worker output/)
  --offset <n>                           Address-sorted slice offset (default: 0)
  --limit <n>                            Item count, maximum 100 (default: 100)
  --concurrency <n>                      Persistent Chromium pages (default: 4)
  --legacy-swapped-trait-columns         Correct the two legacy BigQuery columns
  --asset-origin <url>                   Public metadata/image origin
  --metadata-renderer-origin <url>       animation_url/external_url renderer
  --capture-renderer-origin <url>        Renderer used by Playwright
  --renderer-revision <sha256:hex>       Required renderer bundle revision
  --expected-root <0xhex>                Reviewed full-snapshot Merkle root
  --external-origin <url>                Optional external_url origin
  --chromium-executable <path>           Optional Chromium/Chrome executable
  --upload                               Upload immutably to the fixed staging R2 bucket
  --help                                 Show this help

R2 upload credentials:
  R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY

Fixed upload target:
  account ${STAGING_R2_ACCOUNT_ID}
  bucket  ${STAGING_R2_BUCKET_NAME}
`

export class CliError extends Error {
  override readonly name = 'CliError'
}

const positiveInteger = (value: string, label: string): number => {
  if (!/^\d+$/.test(value)) throw new CliError(`${label} must be an integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliError(`${label} must be a positive integer`)
  }
  return parsed
}

const nonNegativeInteger = (value: string, label: string): number => {
  if (!/^\d+$/.test(value)) throw new CliError(`${label} must be an integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new CliError(`${label} must be a non-negative integer`)
  }
  return parsed
}

const absoluteHttpUrl = (value: string, label: string): string => {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new CliError(`${label} must be an absolute URL`, { cause: error })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CliError(`${label} must use HTTP or HTTPS`)
  }
  return url.toString().replace(/\/$/, '')
}

const nextValue = (
  arguments_: readonly string[],
  index: number,
  flag: string,
): string => {
  const value = arguments_[index + 1]
  if (!value || value.startsWith('--')) {
    throw new CliError(`${flag} requires a value`)
  }
  return value
}

export const parsePilotCliOptions = (
  arguments_: readonly string[],
): PilotCliOptions | { readonly help: true } => {
  if (arguments_.includes('--help')) return { help: true }

  const inputPaths: string[] = []
  let assetOrigin = STAGING_ASSET_ORIGIN
  let captureRendererOrigin = DEFAULT_CAPTURE_RENDERER_ORIGIN
  let chromiumExecutablePath: string | undefined
  let concurrency = 4
  let expectedRoot = REVIEWED_MERKLE_ROOT
  let externalOrigin: string | undefined
  let legacySwappedTraitColumns = false
  let limit = PILOT_ITEM_LIMIT
  let metadataRendererOrigin = DEFAULT_METADATA_RENDERER_ORIGIN
  let offset = 0
  let outputDirectory = DEFAULT_OUTPUT_DIRECTORY
  let rendererRevision = PINNED_RENDERER_REVISION
  let shouldUpload = false

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--') continue
    if (argument === '--upload') {
      shouldUpload = true
      continue
    }
    if (argument === '--legacy-swapped-trait-columns') {
      legacySwappedTraitColumns = true
      continue
    }

    const value = nextValue(arguments_, index, argument)
    index += 1
    switch (argument) {
      case '--input':
        inputPaths.push(resolve(value))
        break
      case '--output':
        outputDirectory = resolve(value)
        break
      case '--offset':
        offset = nonNegativeInteger(value, '--offset')
        break
      case '--limit':
        limit = positiveInteger(value, '--limit')
        break
      case '--concurrency':
        concurrency = positiveInteger(value, '--concurrency')
        break
      case '--asset-origin':
        assetOrigin = absoluteHttpUrl(value, '--asset-origin')
        break
      case '--metadata-renderer-origin':
        metadataRendererOrigin = absoluteHttpUrl(
          value,
          '--metadata-renderer-origin',
        )
        break
      case '--capture-renderer-origin':
        captureRendererOrigin = absoluteHttpUrl(
          value,
          '--capture-renderer-origin',
        )
        break
      case '--external-origin':
        externalOrigin = absoluteHttpUrl(value, '--external-origin')
        break
      case '--renderer-revision':
        rendererRevision = value
        break
      case '--expected-root':
        expectedRoot = value
        break
      case '--chromium-executable':
        chromiumExecutablePath = resolve(value)
        break
      default:
        throw new CliError(`Unknown option: ${argument}`)
    }
  }

  if (inputPaths.length === 0) {
    throw new CliError('At least one --input CSV is required')
  }
  if (limit > PILOT_ITEM_LIMIT) {
    throw new CliError(
      `This pilot is hard-capped at ${PILOT_ITEM_LIMIT} items; received --limit ${limit}`,
    )
  }
  if (concurrency > 16) {
    throw new CliError('--concurrency cannot exceed 16')
  }

  return {
    assetOrigin,
    captureRendererOrigin,
    ...(chromiumExecutablePath ? { chromiumExecutablePath } : {}),
    concurrency,
    expectedRoot,
    ...(externalOrigin ? { externalOrigin } : {}),
    inputPaths,
    legacySwappedTraitColumns,
    limit,
    metadataRendererOrigin,
    offset,
    outputDirectory,
    rendererRevision,
    shouldUpload,
  }
}

export const pilotHelp = (): string => HELP
