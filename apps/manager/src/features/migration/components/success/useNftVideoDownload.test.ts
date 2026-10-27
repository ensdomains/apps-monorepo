import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveBlobToFile } from '../../commemorative-nft/assets'
import { createCommemorativeNftPreviewEligibility } from '../../commemorative-nft/eligibility.fixture'
import { useNftVideoDownload } from './useNftVideoDownload'

vi.mock('@/config', () => ({ envConfig: { network: 'sepolia' } }))
vi.mock('../../commemorative-nft/assets', () => ({ saveBlobToFile: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const requestId = '00000000-0000-4000-8000-000000000001'
const eligibility = {
  ...createCommemorativeNftPreviewEligibility({}),
  assets: { metadataUrl: 'https://assets.example/token/42.json' },
}
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(I18nProvider, { i18n }, children)

const getExport = () => {
  const frame = document.querySelector<HTMLIFrameElement>(
    'iframe[title="NFT video export"]',
  )
  if (!frame?.contentWindow) throw new Error('Missing export frame')
  const source = frame.contentWindow
  const url = new URL(frame.src)
  vi.spyOn(source, 'postMessage').mockImplementation(() => {})
  const send = (data: object) => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        origin: url.origin,
        data: {
          type: 'ens-commemorative-nft-renderer',
          tokenId: url.searchParams.get('tokenId'),
          requestId,
          ...data,
        },
      }),
    )
  }
  return { frame, send }
}

describe('NFT video download interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // Drive renderer messages locally without fetching an external document.
    vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(
      function (this: HTMLIFrameElement, src) {
        this.setAttribute('src', src)
        this.srcdoc = ''
      },
    )
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(requestId)
    i18n.loadAndActivate({ locale: 'en', messages: {} })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reports failure, allows retry, and tracks the retry through progress and completion', async () => {
    const { result } = renderHook(() => useNftVideoDownload(eligibility), {
      wrapper,
    })
    let first: Promise<void> | undefined
    act(() => {
      first = result.current.download()
    })
    expect(result.current.state).toEqual({ status: 'preparing' })
    const failed = getExport()
    await act(async () => {
      failed.send({ status: 'failed' })
      await first
    })
    expect(result.current.state).toEqual({ status: 'idle' })
    expect(toast.error).toHaveBeenCalledOnce()
    expect(failed.frame.isConnected).toBe(false)

    let retry: Promise<void> | undefined
    act(() => {
      retry = result.current.download()
      void result.current.download()
    })
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
    const active = getExport()
    act(() => {
      active.send({ status: 'ready', videoExport: true })
      active.send({ status: 'video-progress', progress: 0.42 })
    })
    expect(result.current.state).toEqual({ status: 'rendering', progress: 42 })
    await act(async () => {
      active.send({
        status: 'video-complete',
        blob: new Blob(['mp4'], { type: 'video/mp4' }),
      })
      await retry
    })
    expect(result.current.state).toEqual({ status: 'idle' })
    expect(saveBlobToFile).toHaveBeenCalledOnce()
    expect(toast.success).toHaveBeenCalledOnce()
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(active.frame.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns to idle after cancellation without showing a failure notification', async () => {
    const { result } = renderHook(() => useNftVideoDownload(eligibility), {
      wrapper,
    })
    let pending: Promise<void> | undefined
    act(() => {
      pending = result.current.download()
    })
    const { frame } = getExport()
    await act(async () => {
      result.current.cancel()
      await pending
    })
    expect(result.current.state).toEqual({ status: 'idle' })
    expect(frame.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('cancels an export when the card unmounts', async () => {
    const { result, unmount } = renderHook(
      () => useNftVideoDownload(eligibility),
      { wrapper },
    )
    let pending: Promise<void> | undefined
    act(() => {
      pending = result.current.download()
    })
    const { frame } = getExport()
    await act(async () => {
      unmount()
      await pending
    })
    expect(frame.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('cancels the previous NFT export without clearing a new owner’s download', async () => {
    const { result, rerender } = renderHook((nft) => useNftVideoDownload(nft), {
      wrapper,
      initialProps: eligibility,
    })
    let previous: Promise<void> | undefined
    act(() => {
      previous = result.current.download()
    })
    const oldExport = getExport()
    rerender({
      ...eligibility,
      ownerAddress: '0x0000000000000000000000000000000000000001',
    })
    expect(oldExport.frame.isConnected).toBe(false)
    expect(result.current.state).toEqual({ status: 'idle' })
    let current: Promise<void> | undefined
    act(() => {
      current = result.current.download()
    })
    const currentExport = getExport()
    await act(async () => {
      await previous
    })
    expect(result.current.state).toEqual({ status: 'preparing' })
    expect(currentExport.frame).not.toBe(oldExport.frame)
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
    await act(async () => {
      result.current.cancel()
      await current
    })
    expect(result.current.state).toEqual({ status: 'idle' })
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('disables video downloads when renderer metadata is unavailable', async () => {
    const { result } = renderHook(
      () => useNftVideoDownload({ ...eligibility, assets: {} }),
      { wrapper },
    )
    expect(result.current.isAvailable).toBe(false)
    await act(async () => {
      await result.current.download()
    })
    expect(result.current.state).toEqual({ status: 'idle' })
    expect(document.querySelector('iframe')).toBeNull()
  })
})
