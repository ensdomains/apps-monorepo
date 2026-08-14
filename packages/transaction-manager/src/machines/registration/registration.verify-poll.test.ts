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
})
