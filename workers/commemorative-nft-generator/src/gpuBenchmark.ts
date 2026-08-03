import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLocalBrowserFactory, RendererMediaCapture } from './capture.js'
import {
  type CaptureRuntimeConfig,
  loadCaptureRuntimeConfig,
} from './config.js'
import {
  evaluateBenchmarkDeterminism,
  type GpuBenchmarkRun,
  summarizeBenchmarkTimings,
} from './gpuBenchmarkReport.js'
import { probeBrowserGraphics } from './graphics.js'
import { normalizeTokenId } from './keys.js'
import { sha256Hex } from './media.js'
import { parseRenderInput } from './renderInput.js'

export type GpuBenchmarkConfig = CaptureRuntimeConfig & {
  readonly outputDirectory?: string
  readonly renderInputUrl: string
  readonly repeatRuns: number
  readonly tokenId: string
  readonly warmupRuns: number
}

const required = (
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): string => {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const httpUrl = (value: string, name: string): string => {
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use HTTP(S)`)
  }
  return parsed.toString()
}

const integer = (params: {
  readonly fallback: number
  readonly minimum: number
  readonly name: string
  readonly value?: string
}): number => {
  if (!params.value) return params.fallback
  const parsed = Number(params.value)
  if (!Number.isSafeInteger(parsed) || parsed < params.minimum) {
    throw new Error(`${params.name} must be an integer >= ${params.minimum}`)
  }
  return parsed
}

export const loadGpuBenchmarkConfig = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GpuBenchmarkConfig => {
  const captureRuntime = loadCaptureRuntimeConfig(environment)
  if (captureRuntime.chromiumGraphicsMode !== 'ec2-nvidia') {
    throw new Error('GPU benchmark requires CHROMIUM_GRAPHICS_MODE=ec2-nvidia')
  }

  return {
    ...captureRuntime,
    outputDirectory: environment.BENCHMARK_OUTPUT_DIR?.trim() || undefined,
    renderInputUrl: httpUrl(
      required(environment, 'BENCHMARK_RENDER_INPUT_URL'),
      'BENCHMARK_RENDER_INPUT_URL',
    ),
    repeatRuns: integer({
      fallback: 3,
      minimum: 2,
      name: 'BENCHMARK_REPEAT_RUNS',
      value: environment.BENCHMARK_REPEAT_RUNS,
    }),
    tokenId: normalizeTokenId(required(environment, 'BENCHMARK_TOKEN_ID')),
    warmupRuns: integer({
      fallback: 1,
      minimum: 0,
      name: 'BENCHMARK_WARMUP_RUNS',
      value: environment.BENCHMARK_WARMUP_RUNS,
    }),
  }
}

const fetchRenderInput = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Render input returned HTTP ${response.status}`)
  }
  return parseRenderInput(await response.json())
}

const writeQaArtifacts = async (params: {
  readonly mp4: Uint8Array
  readonly outputDirectory: string
  readonly png: Uint8Array
  readonly tokenId: string
}) => {
  const outputDirectory = resolve(params.outputDirectory)
  await mkdir(outputDirectory, { recursive: true })
  const png = resolve(outputDirectory, `${params.tokenId}.png`)
  const mp4 = resolve(outputDirectory, `${params.tokenId}.mp4`)
  await Promise.all([writeFile(png, params.png), writeFile(mp4, params.mp4)])
  return { mp4, png }
}

export const runGpuBenchmark = async (config: GpuBenchmarkConfig) => {
  const browserFactory = createLocalBrowserFactory({
    executablePath: config.chromiumExecutablePath,
    extraArgs: config.chromiumExtraArgs,
    graphicsMode: config.chromiumGraphicsMode,
  })
  const graphics = await probeBrowserGraphics({
    browserFactory,
    configuredMode: 'ec2-nvidia',
  })
  if (!graphics.ready) {
    return {
      graphics,
      runtimeAdapter: config.runtimeAdapter,
      stage: 'readiness',
      status: 'failed',
    } as const
  }

  const renderInput = await fetchRenderInput(config.renderInputUrl)
  const capture = new RendererMediaCapture({
    browserFactory,
    captureTimeoutMs: config.captureTimeoutMs,
    graphicsRequirement: 'ec2-nvidia',
    rendererOrigin: config.rendererOrigin,
    rendererRevision: config.rendererRevision,
  })
  const captureOnce = () =>
    capture.capture({
      renderInput,
      renderInputUrl: config.renderInputUrl,
      tokenId: config.tokenId,
    })

  for (let run = 0; run < config.warmupRuns; run += 1) {
    await captureOnce()
  }

  const runs: GpuBenchmarkRun[] = []
  let qaMedia: Awaited<ReturnType<typeof captureOnce>> | undefined
  for (let index = 0; index < config.repeatRuns; index += 1) {
    const startedAt = performance.now()
    const media = await captureOnce()
    const durationMs = performance.now() - startedAt
    qaMedia ??= media
    runs.push({
      durationMs,
      mp4Bytes: media.mp4.byteLength,
      mp4Sha256: sha256Hex(media.mp4),
      pngBytes: media.png.byteLength,
      pngSha256: sha256Hex(media.png),
      run: index + 1,
    })
  }

  const determinism = evaluateBenchmarkDeterminism(runs)
  const qaArtifacts =
    config.outputDirectory && qaMedia
      ? await writeQaArtifacts({
          ...qaMedia,
          outputDirectory: config.outputDirectory,
          tokenId: config.tokenId,
        })
      : undefined

  return {
    determinism,
    graphics,
    ...(qaArtifacts ? { qaArtifacts } : {}),
    rendererRevision: config.rendererRevision,
    repeatRuns: config.repeatRuns,
    runs,
    runtimeAdapter: config.runtimeAdapter,
    stage: 'complete',
    status: determinism.deterministic ? 'passed' : 'failed',
    timingMs: summarizeBenchmarkTimings(runs),
    tokenId: config.tokenId,
    warmupRuns: config.warmupRuns,
  } as const
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  runGpuBenchmark(loadGpuBenchmarkConfig())
    .then((report) => {
      console.log(JSON.stringify(report, null, 2))
      if (report.status === 'failed') process.exitCode = 1
    })
    .catch((error: unknown) => {
      console.log(
        JSON.stringify(
          {
            error: error instanceof Error ? error.message : String(error),
            stage: 'benchmark',
            status: 'failed',
          },
          null,
          2,
        ),
      )
      process.exitCode = 1
    })
}
