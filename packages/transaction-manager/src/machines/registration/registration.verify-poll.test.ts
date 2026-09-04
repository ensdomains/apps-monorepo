import { describe, expect, it, vi } from 'vitest'
import {
  pollUntilVerified,
  VERIFY_GRACE_WINDOW_MS,
  VERIFY_POLL_INTERVAL_MS,
} from './registration.actors'

describe('pollUntilVerified', () => {
  it('returns immediately when the first read verifies', async () => {
    const check = vi.fn(async () => ({ verified: true }))

    const result = await pollUntilVerified(check, { graceWindowMs: 30_000 })

    expect(result).toEqual({ verified: true })
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('catches a registration that lands after the first read', async () => {
    // The case this exists for: a Rhinestone intent keeps filling server-side
    // after the tab closes, so a resumed run reads the registry a beat early.
    let calls = 0
    const check = vi.fn(async () => {
      calls += 1
      return { verified: calls >= 3 }
    })

    const result = await pollUntilVerified(check, {
      graceWindowMs: 500,
      pollIntervalMs: 10,
    })

    expect(result).toEqual({ verified: true })
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('gives up once the grace window closes', async () => {
    const check = vi.fn(async () => ({ verified: false }))

    const started = Date.now()
    const result = await pollUntilVerified(check, {
      graceWindowMs: 60,
      pollIntervalMs: 20,
    })

    expect(result).toEqual({ verified: false })
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(check.mock.calls.length).toBeGreaterThan(1)
  })

  it('degrades to a single read with no grace window', async () => {
    const check = vi.fn(async () => ({ verified: false }))

    await pollUntilVerified(check, { graceWindowMs: 0 })

    expect(check).toHaveBeenCalledTimes(1)
  })

  it('stops on abort instead of running the window out', async () => {
    const controller = new AbortController()
    const check = vi.fn(async () => {
      controller.abort()
      return { verified: false }
    })

    const result = await pollUntilVerified(check, {
      // Long enough that finishing the window would hang the test.
      graceWindowMs: 60_000,
      pollIntervalMs: 5_000,
      signal: controller.signal,
    })

    expect(result).toEqual({ verified: false })
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('does not read at all past an already-aborted signal beyond the first', async () => {
    const controller = new AbortController()
    controller.abort()
    const check = vi.fn(async () => ({ verified: false }))

    await pollUntilVerified(check, {
      graceWindowMs: 60_000,
      signal: controller.signal,
    })

    expect(check).toHaveBeenCalledTimes(1)
  })

  it('exposes defaults that bound the wait', () => {
    expect(VERIFY_GRACE_WINDOW_MS).toBe(30_000)
    expect(VERIFY_POLL_INTERVAL_MS).toBe(5_000)
  })

  it('short-circuits the window when the intent is definitively dead', async () => {
    // The orchestrator says FAILED/EXPIRED: the fill can never land, so the
    // grace window would be 30s of waiting for a state that cannot appear.
    const check = vi.fn(async () => ({ verified: false }))
    const isDefinitivelyDead = vi.fn(async () => true)

    const result = await pollUntilVerified(check, {
      // Long enough that running the window out would hang the test.
      graceWindowMs: 60_000,
      pollIntervalMs: 5_000,
      isDefinitivelyDead,
    })

    expect(result).toEqual({ verified: false })
    expect(check).toHaveBeenCalledTimes(1)
    expect(isDefinitivelyDead).toHaveBeenCalledTimes(1)
  })

  it('keeps polling on an inconclusive death verdict', async () => {
    let calls = 0
    const check = vi.fn(async () => {
      calls += 1
      return { verified: calls >= 2 }
    })
    const isDefinitivelyDead = vi.fn(async () => false)

    const result = await pollUntilVerified(check, {
      graceWindowMs: 500,
      pollIntervalMs: 10,
      isDefinitivelyDead,
    })

    expect(result).toEqual({ verified: true })
    // Consulted once, not per poll iteration.
    expect(isDefinitivelyDead).toHaveBeenCalledTimes(1)
  })

  it('treats a thrown death verdict as inconclusive', async () => {
    // An unreachable orchestrator must never fail a verification the chain
    // could still confirm.
    let calls = 0
    const check = vi.fn(async () => {
      calls += 1
      return { verified: calls >= 2 }
    })

    const result = await pollUntilVerified(check, {
      graceWindowMs: 500,
      pollIntervalMs: 10,
      isDefinitivelyDead: async () => {
        throw new Error('orchestrator unreachable')
      },
    })

    expect(result).toEqual({ verified: true })
  })

  it('bounds a hung death oracle to one poll interval', async () => {
    // The oracle exists to SHORTEN the window; a fetch that never responds
    // (connection accepted, no reply) must degrade to the blind poll rather
    // than stall verification for the browser's minutes-long fetch timeout.
    let calls = 0
    const check = vi.fn(async () => {
      calls += 1
      return { verified: calls >= 2 }
    })

    const result = await pollUntilVerified(check, {
      graceWindowMs: 500,
      pollIntervalMs: 10,
      isDefinitivelyDead: () => new Promise<boolean>(() => {}),
    })

    expect(result).toEqual({ verified: true })
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('never consults the death verdict when the first read verifies', async () => {
    // The chain is authoritative; a registered name needs no second opinion.
    const isDefinitivelyDead = vi.fn(async () => true)

    const result = await pollUntilVerified(async () => ({ verified: true }), {
      graceWindowMs: 60_000,
      isDefinitivelyDead,
    })

    expect(result).toEqual({ verified: true })
    expect(isDefinitivelyDead).not.toHaveBeenCalled()
  })
})
