import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useDecodedNftImage,
  useNftArtworkLoading,
} from './useNftArtworkLoading'

const imageUrl = 'https://assets.example/card.webp'
const images: HTMLImageElement[] = []

const decodeImage = async () => {
  const image = images.at(-1)
  if (!image) throw new Error('No image is loading')
  await act(async () => image.dispatchEvent(new Event('load')))
}

describe('NFT artwork loading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'Image',
      vi.fn(function loadImage() {
        const image = document.createElement('img')
        image.decode = vi.fn().mockResolvedValue(undefined)
        images.push(image)
        return image
      }),
    )
  })
  afterEach(() => {
    cleanup()
    images.length = 0
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('preloads the image alongside animation without revealing an intermediate still', async () => {
    const { result } = renderHook(() =>
      useNftArtworkLoading({ imageUrl, animate: true }),
    )
    expect(images[0]?.src).toBe(imageUrl)
    expect(result.current.renderAnimation).toBe(true)
    await decodeImage()
    expect(result.current.imageReady).toBe(true)
    expect(result.current.status).toBe('loading')
    act(() => result.current.onRendererReady())
    expect(result.current.status).toBe('ready')
  })

  it('immediately uses a decoded still after renderer failure and latches fallback across visibility changes', async () => {
    const { result, rerender } = renderHook(
      ({ animate }) => useNftArtworkLoading({ imageUrl, animate }),
      { initialProps: { animate: true } },
    )
    await decodeImage()
    act(() => result.current.onRendererError())
    expect(result.current.status).toBe('ready')
    expect(result.current.renderAnimation).toBe(false)
    rerender({ animate: false })
    rerender({ animate: true })
    act(() => result.current.onRendererReady())
    expect(result.current.renderAnimation).toBe(false)
    expect(result.current.status).toBe('ready')
  })

  it('keeps the decoded still ready while suspending and restarting animation', async () => {
    const { result, rerender } = renderHook(
      ({ animate }) => useNftArtworkLoading({ imageUrl, animate }),
      { initialProps: { animate: true } },
    )
    await decodeImage()
    act(() => result.current.onRendererReady())
    rerender({ animate: false })
    expect(result.current.renderAnimation).toBe(false)
    expect(result.current.status).toBe('ready')
    rerender({ animate: true })
    expect(result.current.renderAnimation).toBe(true)
    expect(result.current.status).toBe('ready')
  })

  it('makes a reduced-motion static preview ready without starting the renderer', async () => {
    const { result, rerender } = renderHook(
      ({ animate }) => useNftArtworkLoading({ imageUrl, animate }),
      { initialProps: { animate: false } },
    )
    await decodeImage()
    expect(result.current.status).toBe('ready')
    expect(result.current.renderAnimation).toBe(false)
    rerender({ animate: true })
    expect(result.current.status).toBe('ready')
  })

  it('does not reveal a cached still before initial visibility is known', async () => {
    const { result, rerender } = renderHook(
      ({ waitingForVisibility, animate }) =>
        useNftArtworkLoading({ imageUrl, waitingForVisibility, animate }),
      { initialProps: { waitingForVisibility: true, animate: false } },
    )
    await decodeImage()
    expect(result.current.status).toBe('loading')
    rerender({ waitingForVisibility: false, animate: true })
    expect(result.current.status).toBe('loading')
  })

  it('shows an error only when both available sources fail', () => {
    const { result } = renderHook(() =>
      useNftArtworkLoading({ imageUrl, animate: true }),
    )
    act(() => images[0]?.dispatchEvent(new Event('error')))
    expect(result.current.status).toBe('loading')
    act(() => result.current.onRendererError())
    expect(result.current.status).toBe('error')
  })

  it('holds the placeholder until image decoding finishes', async () => {
    const { result } = renderHook(() => useDecodedNftImage(imageUrl))
    let resolveDecode: (() => void) | undefined
    const decoded = new Promise<void>((resolve) => {
      resolveDecode = resolve
    })
    const image = images[0]
    if (!image) throw new Error('No image is loading')
    vi.mocked(image.decode).mockReturnValue(decoded)
    await decodeImage()
    expect(result.current).toBe('loading')
    await act(async () => resolveDecode?.())
    expect(result.current).toBe('ready')
  })

  it('fails a stalled image and ignores a late decode', async () => {
    const { result } = renderHook(() => useDecodedNftImage(imageUrl))
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current).toBe('failed')
    await decodeImage()
    expect(result.current).toBe('failed')
  })

  it('cleans up the image and timer on unmount', () => {
    const { unmount } = renderHook(() => useDecodedNftImage(imageUrl))
    unmount()
    expect(images[0]?.getAttribute('src')).toBeNull()
    expect(images[0]?.onload).toBeNull()
    expect(images[0]?.onerror).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not retain a previous owners decoded image when the URL changes', async () => {
    const { result, rerender } = renderHook(
      ({ url }) => useDecodedNftImage(url),
      { initialProps: { url: imageUrl } },
    )
    await decodeImage()
    expect(result.current).toBe('ready')
    rerender({ url: 'https://assets.example/other.webp' })
    expect(result.current).toBe('loading')
    expect(images[0]?.getAttribute('src')).toBeNull()
    await decodeImage()
    expect(result.current).toBe('ready')
  })
})
