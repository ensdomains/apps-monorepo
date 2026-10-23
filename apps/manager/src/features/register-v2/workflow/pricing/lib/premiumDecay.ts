/**
 * Premium decay calculation utilities for the v2 StandardRentPriceOracle.
 *
 * The temporary premium follows an exponential halving decay:
 *   price(t) = startPrice * 2^(-t / halvingPeriod) - offset
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type PremiumDecayConfig = {
  readonly startPriceUsd: number
  readonly halvingPeriodMs: number
  readonly periodMs: number
}

export function getPremiumPeriodDays(config: PremiumDecayConfig): number {
  return Math.round(config.periodMs / MS_PER_DAY)
}

function computeOffset(config: PremiumDecayConfig): number {
  return config.startPriceUsd * 2 ** (-config.periodMs / config.halvingPeriodMs)
}

export type PremiumInstantRange = {
  startMs: number
  endMs: number
}

export function getPremiumInstantRange(
  currentPremiumUsd: number,
  nowMs: number = Date.now(),
  config?: PremiumDecayConfig,
): PremiumInstantRange | null {
  if (!config || currentPremiumUsd <= 0) return null

  const offset = computeOffset(config)
  const elapsedMs =
    -config.halvingPeriodMs *
    Math.log2((currentPremiumUsd + offset) / config.startPriceUsd)

  const startMs = Math.round(nowMs - elapsedMs)
  const endMs = startMs + config.periodMs
  return { startMs, endMs }
}

export function getPremiumPriceAtInstant(
  startMs: number,
  targetMs: number,
  config?: PremiumDecayConfig,
): number {
  if (!config) return 0

  const offset = computeOffset(config)
  const elapsedMs = targetMs - startMs
  if (elapsedMs < 0) return config.startPriceUsd - offset
  if (elapsedMs >= config.periodMs) return 0

  return Math.max(
    config.startPriceUsd * 2 ** (-elapsedMs / config.halvingPeriodMs) - offset,
    0,
  )
}
