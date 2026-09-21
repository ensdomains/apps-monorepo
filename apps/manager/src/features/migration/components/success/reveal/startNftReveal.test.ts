import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NFT_REVEAL_DURATION } from './revealTiming'
import { startNftReveal } from './startNftReveal'

const context = {
  scale: vi.fn(),
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
}
let nextFrame: FrameRequestCallback | undefined
const setup = () => {
  const host = document.createElement('div')
  Object.defineProperties(host, {
    clientWidth: { value: 193 },
    clientHeight: { value: 273 },
  })
  const mystery = document.createElement('img')
  mystery.width = 478
  mystery.height = 676
  const onComplete = vi.fn()
  return { host, mystery, onComplete }
}

describe('native NFT reveal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    nextFrame = undefined
    vi.spyOn(performance, 'now').mockReturnValue(0)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    )
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        nextFrame = callback
        return 1
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('draws finite frames and releases its canvas before reporting completion', () => {
    const params = setup()
    startNftReveal(params)
    const canvas = params.host.querySelector('canvas')
    expect(canvas).not.toBeNull()
    nextFrame?.(NFT_REVEAL_DURATION / 2)
    expect(context.fill).toHaveBeenCalledTimes(1)
    expect(params.onComplete).not.toHaveBeenCalled()
    nextFrame?.(NFT_REVEAL_DURATION)
    expect(params.onComplete).toHaveBeenCalledTimes(1)
    expect(params.host.childElementCount).toBe(0)
    expect(canvas?.width).toBe(0)
    nextFrame?.(NFT_REVEAL_DURATION + 16)
    expect(params.onComplete).toHaveBeenCalledTimes(1)
  })

  it('cancels an interrupted reveal without completion or late drawing', () => {
    const params = setup()
    const dispose = startNftReveal(params)
    const draws = context.drawImage.mock.calls.length
    dispose()
    dispose()
    nextFrame?.(100)
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(context.drawImage).toHaveBeenCalledTimes(draws)
    expect(params.onComplete).not.toHaveBeenCalled()
    expect(params.host.childElementCount).toBe(0)
  })

  it('falls back to the still once if a frame fails', () => {
    const params = setup()
    startNftReveal(params)
    context.drawImage.mockImplementation(() => {
      throw new Error('Canvas lost')
    })
    nextFrame?.(100)
    nextFrame?.(200)
    expect(params.onComplete).toHaveBeenCalledTimes(1)
    expect(params.host.childElementCount).toBe(0)
  })

  it('cleans up when native canvas is unavailable', () => {
    const params = setup()
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    expect(() => startNftReveal(params)).toThrow('Reveal canvas unavailable')
    expect(params.host.childElementCount).toBe(0)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('releases the overlay on context loss without duplicate completion', () => {
    const params = setup()
    startNftReveal(params)
    const canvas = params.host.querySelector('canvas')
    canvas?.dispatchEvent(new Event('contextlost'))
    canvas?.dispatchEvent(new Event('contextlost'))
    nextFrame?.(NFT_REVEAL_DURATION)
    expect(params.onComplete).toHaveBeenCalledTimes(1)
    expect(params.host.childElementCount).toBe(0)
  })
})
