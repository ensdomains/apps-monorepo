import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startNftReveal } from './reveal/startNftReveal'
import { useNftReveal } from './useNftReveal'

vi.mock('./reveal/startNftReveal', () => ({ startNftReveal: vi.fn() }))
const dispose = vi.fn()
const initialProps = {
  enabled: true,
  visible: true,
  status: 'loading' as 'loading' | 'ready' | 'error',
}
const setup = (props = initialProps) =>
  renderHook(
    (options) => {
      const reveal = useNftReveal(options)
      reveal.host.current = document.createElement('div')
      return reveal
    },
    { initialProps: props },
  )
const flush = () =>
  act(async () => {
    await vi.dynamicImportSettled()
  })

describe('NFT reveal lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(startNftReveal).mockReset().mockReturnValue(dispose)
    dispose.mockReset()
    vi.stubGlobal(
      'Image',
      vi.fn(function createImage() {
        const image = document.createElement('img')
        image.decode = vi.fn().mockResolvedValue(undefined)
        return image
      }),
    )
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('holds the placeholder until artwork is ready, then reveals before enabling actions', async () => {
    const { result, rerender } = setup()
    expect(startNftReveal).not.toHaveBeenCalled()
    expect(result.current.showArtwork).toBe(false)
    rerender({ ...initialProps, status: 'ready' })
    await flush()
    expect(startNftReveal).toHaveBeenCalledTimes(1)
    expect(result.current.showArtwork).toBe(true)
    expect(result.current.ready).toBe(false)
    const options = vi.mocked(startNftReveal).mock.calls[0]?.[0]
    act(() => options?.onComplete())
    expect(result.current.ready).toBe(true)
    expect(result.current.status).toBe('ready')
    expect(dispose).toHaveBeenCalled()
    rerender({ ...initialProps, status: 'ready' })
    expect(startNftReveal).toHaveBeenCalledTimes(1)
  })

  it('skips the reveal for reduced motion or a non-dialog card', async () => {
    const { result } = setup({
      ...initialProps,
      enabled: false,
      status: 'ready',
    })
    await flush()
    expect(result.current.ready).toBe(true)
    expect(startNftReveal).not.toHaveBeenCalled()
    expect(Image).not.toHaveBeenCalled()
  })

  it('disposes an interrupted reveal and never replays on return from a hidden tab', async () => {
    const { rerender, result } = setup({ ...initialProps, status: 'ready' })
    await flush()
    rerender({ ...initialProps, status: 'ready', visible: false })
    expect(dispose).toHaveBeenCalled()
    rerender({ ...initialProps, status: 'ready' })
    await flush()
    expect(result.current.ready).toBe(true)
    expect(startNftReveal).toHaveBeenCalledTimes(1)
  })

  it('retains the ready artwork when Canvas 2D cannot initialize', async () => {
    vi.mocked(startNftReveal).mockImplementation(() => {
      throw new Error('Canvas 2D unavailable')
    })
    const { result } = setup({ ...initialProps, status: 'ready' })
    await flush()
    expect(result.current.ready).toBe(true)
    expect(result.current.running).toBe(false)
  })

  it('times out a stalled texture and ignores its late completion', async () => {
    let resolveDecode: (() => void) | undefined
    vi.stubGlobal(
      'Image',
      vi.fn(function createImage() {
        const image = document.createElement('img')
        image.decode = () =>
          new Promise<void>((resolve) => {
            resolveDecode = resolve
          })
        return image
      }),
    )
    const { result } = setup({ ...initialProps, status: 'ready' })
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.ready).toBe(true)
    await act(async () => resolveDecode?.())
    expect(startNftReveal).not.toHaveBeenCalled()
  })

  it('does no rendering after close, including late image completion', async () => {
    const { unmount } = setup({ ...initialProps, status: 'ready' })
    unmount()
    await flush()
    expect(startNftReveal).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
