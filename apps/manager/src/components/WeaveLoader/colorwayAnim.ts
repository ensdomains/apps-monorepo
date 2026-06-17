/** Ported from Jacquard App.jsx — sinusoidal loop through [minV, maxV] from a captured origin. */
export function colorwayOscFromOrigin(
  tMs: number,
  periodMs: number,
  minV: number,
  maxV: number,
  origin: number,
): number {
  const span = maxV - minV
  if (span <= 0) return origin
  const u = Math.max(0, Math.min(1, (Number(origin) - minV) / span))
  const phi = Math.asin(2 * u - 1)
  const tau = 2 * Math.PI
  return minV + span * (0.5 + 0.5 * Math.sin(phi + (tMs / periodMs) * tau))
}

export function colorwayOscClamped(
  tMs: number,
  periodMs: number,
  minV: number,
  maxV: number,
  origin: number,
): number {
  const o = Number(origin)
  const clamped = Number.isFinite(o)
    ? Math.max(minV, Math.min(maxV, o))
    : (minV + maxV) * 0.5
  return colorwayOscFromOrigin(tMs, periodMs, minV, maxV, clamped)
}

/** Jacquard bias play toggle: 44s loop between 0.25 and 4. */
export const COLORWAY_BIAS_ANIM = {
  periodMs: 44_000,
  min: 0.25,
  max: 4,
} as const

/** Jacquard noise X play toggle: ~50min loop between -500 and 500. */
export const COLORWAY_NOISE_X_ANIM = {
  periodMs: 3_000_000,
  min: -500,
  max: 500,
} as const

type ColorwayOscAnim = {
  periodMs: number
  min: number
  max: number
}

function resolveAnimatedColorwayField(
  enabled: boolean,
  elapsedMs: number,
  origin: number,
  anim: ColorwayOscAnim,
): number {
  if (!enabled) return origin
  return colorwayOscClamped(
    elapsedMs,
    anim.periodMs,
    anim.min,
    anim.max,
    origin,
  )
}

export function resolveAnimatedColorwayBias(
  enabled: boolean,
  elapsedMs: number,
  origin: number,
): number {
  return resolveAnimatedColorwayField(
    enabled,
    elapsedMs,
    origin,
    COLORWAY_BIAS_ANIM,
  )
}

export function resolveAnimatedColorwayNoiseX(
  enabled: boolean,
  elapsedMs: number,
  origin: number,
): number {
  return resolveAnimatedColorwayField(
    enabled,
    elapsedMs,
    origin,
    COLORWAY_NOISE_X_ANIM,
  )
}

export function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Jacquard-ish ranges for loop randomization. */
export function randomColorwayLoopValues() {
  return {
    seed: randomInRange(0, 100),
    noiseScale: randomInRange(0.005, 0.071),
    bleedAnisotropy: randomInRange(0.6, 10.1),
    biasOrigin: randomInRange(COLORWAY_BIAS_ANIM.min, COLORWAY_BIAS_ANIM.max),
    noiseXOrigin: randomInRange(-250, 250),
  }
}

export type ColorwayAnimSlot = {
  enabled: boolean
  origin: number
  startMs: number
}

/** Returns elapsed ms for this cycle; optionally wraps and randomizes origins. */
export function tickColorwayAnimSlot(
  slot: ColorwayAnimSlot,
  anim: ColorwayOscAnim,
  loop: boolean,
  randomizeOrigin: boolean,
): number {
  const now = Date.now()
  let elapsed = now - slot.startMs
  if (loop && elapsed >= anim.periodMs) {
    slot.startMs = now
    elapsed = 0
    if (randomizeOrigin) {
      slot.origin = randomInRange(anim.min, anim.max)
    }
  }
  return elapsed
}

/** Shared loop clock — bias period (44s) retriggers all colorway anim slots. */
export function tickColorwayLoopCycle(
  loopStartMs: number,
  periodMs: number,
): { elapsed: number; startMs: number; didWrap: boolean } {
  const now = Date.now()
  const elapsed = now - loopStartMs
  if (elapsed >= periodMs) {
    return { elapsed: 0, startMs: now, didWrap: true }
  }
  return { elapsed, startMs: loopStartMs, didWrap: false }
}
