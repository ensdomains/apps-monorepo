export type GpuBenchmarkRun = {
  readonly durationMs: number
  readonly mp4Bytes: number
  readonly mp4Sha256: string
  readonly pngBytes: number
  readonly pngSha256: string
  readonly run: number
}

export type BenchmarkTimingSummary = {
  readonly max: number
  readonly mean: number
  readonly min: number
  readonly p50: number
  readonly p95: number
}

export type BenchmarkDeterminism = {
  readonly deterministic: boolean
  readonly mp4Sha256?: string
  readonly pngSha256?: string
  readonly uniqueMp4Hashes: number
  readonly uniquePngHashes: number
}

const round = (value: number): number => Math.round(value * 100) / 100

const nearestRank = (sorted: readonly number[], percentile: number): number => {
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1)
  return sorted[index]
}

export const summarizeBenchmarkTimings = (
  runs: readonly GpuBenchmarkRun[],
): BenchmarkTimingSummary => {
  if (runs.length === 0)
    throw new Error('At least one benchmark run is required')
  if (
    runs.some(
      ({ durationMs }) => !Number.isFinite(durationMs) || durationMs < 0,
    )
  ) {
    throw new Error('Benchmark durations must be finite non-negative numbers')
  }

  const sorted = runs.map(({ durationMs }) => durationMs).sort((a, b) => a - b)
  const total = sorted.reduce((sum, duration) => sum + duration, 0)
  return {
    max: round(sorted.at(-1) as number),
    mean: round(total / sorted.length),
    min: round(sorted[0]),
    p50: round(nearestRank(sorted, 0.5)),
    p95: round(nearestRank(sorted, 0.95)),
  }
}

export const evaluateBenchmarkDeterminism = (
  runs: readonly GpuBenchmarkRun[],
): BenchmarkDeterminism => {
  if (runs.length === 0)
    throw new Error('At least one benchmark run is required')

  const pngHashes = new Set(runs.map(({ pngSha256 }) => pngSha256))
  const mp4Hashes = new Set(runs.map(({ mp4Sha256 }) => mp4Sha256))
  const deterministic = pngHashes.size === 1 && mp4Hashes.size === 1
  return {
    deterministic,
    ...(deterministic
      ? {
          mp4Sha256: runs[0].mp4Sha256,
          pngSha256: runs[0].pngSha256,
        }
      : {}),
    uniqueMp4Hashes: mp4Hashes.size,
    uniquePngHashes: pngHashes.size,
  }
}
