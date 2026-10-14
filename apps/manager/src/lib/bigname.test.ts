import { describe, expect, it } from 'vitest'
import { withTimeout } from './bigname'

describe('withTimeout', () => {
  it('keeps the caller able to cancel the request', () => {
    const controller = new AbortController()
    const { signal } = withTimeout({ signal: controller.signal })

    expect(signal?.aborted).toBe(false)
    controller.abort()
    expect(signal?.aborted).toBe(true)
  })

  it('adds a timeout when the caller passes no signal', () => {
    expect(withTimeout(undefined).signal).toBeInstanceOf(AbortSignal)
  })
})
