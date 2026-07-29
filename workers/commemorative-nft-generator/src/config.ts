export type GeneratorConfig = {
  readonly authToken: string
  readonly captureTimeoutMs: number
  readonly chromiumExecutablePath?: string
  readonly externalOrigin?: string
  readonly port: number
  readonly publicAssetOrigin: string
  readonly publicR2Origin: string
  readonly r2AccessKeyId: string
  readonly r2AccountId: string
  readonly r2BucketName: string
  readonly r2SecretAccessKey: string
  readonly rendererOrigin: string
  readonly rendererRevision: string
}

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

export const loadGeneratorConfig = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GeneratorConfig => {
  const publicR2Origin = origin(
    required(environment, 'R2_PUBLIC_ORIGIN'),
    'R2_PUBLIC_ORIGIN',
  )

  return {
    authToken: required(environment, 'GENERATOR_AUTH_TOKEN'),
    captureTimeoutMs: positiveInteger(
      environment.CAPTURE_TIMEOUT_MS,
      600_000,
      'CAPTURE_TIMEOUT_MS',
    ),
    chromiumExecutablePath:
      environment.CHROMIUM_EXECUTABLE_PATH?.trim() || undefined,
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
    r2BucketName:
      environment.R2_BUCKET_NAME?.trim() || 'ensv2-commemorative-nft-staging',
    r2SecretAccessKey: required(environment, 'R2_SECRET_ACCESS_KEY'),
    rendererOrigin: origin(
      environment.RENDERER_ORIGIN || 'https://ens-renderer.pages.dev',
      'RENDERER_ORIGIN',
    ),
    rendererRevision: required(environment, 'RENDERER_REVISION'),
  }
}
