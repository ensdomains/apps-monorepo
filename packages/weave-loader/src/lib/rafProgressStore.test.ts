import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRafProgressStore } from './rafProgressStore'

/** Runs one rAF callback per timestamp, the way a browser would. */
const runFrames = (timestamps: readonly number[]) => {
  const queue = new Map<number, FrameRequestCallback>()
  let nextId = 1
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextId++
    queue.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))

  return {
    flush: () => {
      for (const timestamp of timestamps) {
        const [entry] = queue.entries()
        if (!entry) return
        queue.delete(entry[0])
        entry[1](timestamp)
      }
    },
  }
}

describe('createRafProgressStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // A hidden tab runs no frames, so the first frame back arrives 30s later.
  it.each([
    { maxDtSeconds: undefined, expected: 0.016 + 0.1 },
    { maxDtSeconds: Number.POSITIVE_INFINITY, expected: 0.016 + 30 },
  ])(
    'caps the gap after a hidden tab at $maxDtSeconds',
    ({ maxDtSeconds, expected }) => {
      const frames = runFrames([1000, 1016, 31_016])
      const store = createRafProgressStore<null>({
        advance: (_context, current, dt) => current + dt,
        maxDtSeconds,
      })
      store.setContext(null)
      store.subscribe(() => {})

      frames.flush()

      expect(store.getSnapshot()).toBeCloseTo(expected, 6)
    },
  )
})
