import {
  CHROMIUM_GRAPHICS_MODES,
  type ChromiumGraphicsMode,
  type GeneratorRuntimeAdapter,
  runtimeAdapterForGraphicsMode,
} from './runtime.js'

export type CaptureRuntimeConfig = {
  readonly captureTimeoutMs: number
  readonly chromiumExecutablePath?: string
  readonly chromiumExtraArgs: readonly string[]
  readonly chromiumGraphicsMode: ChromiumGraphicsMode
  readonly rendererOrigin: string
  readonly rendererRevision: string
  readonly runtimeAdapter: GeneratorRuntimeAdapter
}

export type GeneratorConfig = CaptureRuntimeConfig & {
  readonly authToken: string
  readonly externalOrigin?: string
  readonly port: number
  readonly publicAssetOrigin: string
  readonly publicR2Origin: string
  readonly r2AccessKeyId: string
  readonly r2AccountId: string
  readonly r2BucketName: string
  readonly r2SecretAccessKey: string
}

const STAGING_R2_BUCKET_NAME = 'ensv2-commemorative-nft-staging'
const NVIDIA_PROTECTED_CHROMIUM_FLAGS = [
  '--disable-gpu',
  '--disable-gpu-rasterization',
  '--disable-features=',
  '--disable-webgl',
  '--enable-features=',
  '--enable-software-rasterizer',
  '--enable-unsafe-swiftshader',
  '--use-angle=',
  '--use-gl=',
] as const

const required = (
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): string => {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const origin = (value: string, name: string): string => {
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use HTTP(S)`)
  }
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/+$/, '')
}

const positiveInteger = (
  value: string | undefined,
  fallback: number,
  name: string,
): number => {
  if (!value) return fallback

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

const chromiumGraphicsMode = (
  value: string | undefined,
): ChromiumGraphicsMode => {
  const mode = value?.trim() || 'ec2-nvidia'
  if (!CHROMIUM_GRAPHICS_MODES.some((candidate) => candidate === mode)) {
    throw new Error(
      `CHROMIUM_GRAPHICS_MODE must be one of: ${CHROMIUM_GRAPHICS_MODES.join(', ')}`,
    )
  }
  return mode as ChromiumGraphicsMode
}

const stringArray = (value: string | undefined, name: string): string[] => {
  if (!value?.trim()) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${name} must be a JSON array of strings`)
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((entry) => typeof entry !== 'string' || !entry.trim())
  ) {
    throw new Error(`${name} must be a JSON array of non-empty strings`)
  }
  return parsed
}

export const loadCaptureRuntimeConfig = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): CaptureRuntimeConfig => {
  const graphicsMode = chromiumGraphicsMode(environment.CHROMIUM_GRAPHICS_MODE)
  const chromiumExtraArgs = stringArray(
    environment.CHROMIUM_EXTRA_ARGS_JSON,
    'CHROMIUM_EXTRA_ARGS_JSON',
  )
  if (graphicsMode === 'ec2-nvidia') {
    const conflictingFlag = chromiumExtraArgs.find((argument) =>
      NVIDIA_PROTECTED_CHROMIUM_FLAGS.some((flag) =>
        flag.endsWith('=') ? argument.startsWith(flag) : argument === flag,
      ),
    )
    if (conflictingFlag) {
      throw new Error(
        `CHROMIUM_EXTRA_ARGS_JSON cannot override the NVIDIA profile with ${conflictingFlag}`,
      )
    }
  }

  return {
    captureTimeoutMs: positiveInteger(
      environment.CAPTURE_TIMEOUT_MS,
      390_000,
      'CAPTURE_TIMEOUT_MS',
    ),
    chromiumExecutablePath:
      environment.CHROMIUM_EXECUTABLE_PATH?.trim() || undefined,
    chromiumExtraArgs,
    chromiumGraphicsMode: graphicsMode,
    rendererOrigin: origin(
      environment.RENDERER_ORIGIN || 'https://ens-renderer.pages.dev',
      'RENDERER_ORIGIN',
    ),
    rendererRevision: required(environment, 'RENDERER_REVISION'),
    runtimeAdapter: runtimeAdapterForGraphicsMode(graphicsMode),
  }
}

export const loadGeneratorConfig = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GeneratorConfig => {
  const captureRuntime = loadCaptureRuntimeConfig(environment)
  const publicR2Origin = origin(
    required(environment, 'R2_PUBLIC_ORIGIN'),
    'R2_PUBLIC_ORIGIN',
  )
  const r2BucketName =
    environment.R2_BUCKET_NAME?.trim() || STAGING_R2_BUCKET_NAME
  if (
    captureRuntime.chromiumGraphicsMode === 'software' &&
    r2BucketName === STAGING_R2_BUCKET_NAME
  ) {
    throw new Error(
      'CHROMIUM_GRAPHICS_MODE=software requires a non-staging R2_BUCKET_NAME',
    )
  }

  return {
    ...captureRuntime,
    authToken: required(environment, 'GENERATOR_AUTH_TOKEN'),
    externalOrigin: environment.NFT_EXTERNAL_ORIGIN
      ? origin(environment.NFT_EXTERNAL_ORIGIN, 'NFT_EXTERNAL_ORIGIN')
      : undefined,
    port: positiveInteger(environment.PORT, 3000, 'PORT'),
    publicAssetOrigin: origin(
      required(environment, 'NFT_PUBLIC_ASSET_ORIGIN'),
      'NFT_PUBLIC_ASSET_ORIGIN',
    ),
    publicR2Origin,
    r2AccessKeyId: required(environment, 'R2_ACCESS_KEY_ID'),
    r2AccountId: required(environment, 'R2_ACCOUNT_ID'),
    r2BucketName,
    r2SecretAccessKey: required(environment, 'R2_SECRET_ACCESS_KEY'),
  }
}
