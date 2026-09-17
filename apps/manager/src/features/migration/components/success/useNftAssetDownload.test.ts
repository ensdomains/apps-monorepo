import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadCommemorativeNftImage } from '../../commemorative-nft/assets'
import { useNftAssetDownload } from './useNftAssetDownload'

vi.mock('../../commemorative-nft/assets', () => ({
  downloadCommemorativeNftImage: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const assetUrl = 'https://assets.example/card.webp'
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(I18nProvider, { i18n }, children)

describe('NFT download interaction', () => {
  beforeEach(() => {
    i18n.loadAndActivate({ locale: 'en', messages: {} })
    vi.clearAllMocks()
  })
  afterEach(cleanup)

  it('blocks duplicate clicks synchronously and reports successful completion', async () => {
    let resolveResponse: (() => void) | undefined
    const response = new Promise<void>((resolve) => {
      resolveResponse = resolve
    })
    vi.mocked(downloadCommemorativeNftImage).mockReturnValue(response)
    const { result } = renderHook(() => useNftAssetDownload(assetUrl), {
      wrapper,
    })
    let first: Promise<void> | undefined
    act(() => {
      first = result.current.download()
      void result.current.download()
    })
    expect(result.current.pending).toBe(true)
    expect(downloadCommemorativeNftImage).toHaveBeenCalledOnce()
    await act(async () => {
      resolveResponse?.()
      await first
    })
    expect(result.current.pending).toBe(false)
    expect(toast.success).toHaveBeenCalledOnce()
  })

  it('shows a failure and permits a retry', async () => {
    vi.mocked(downloadCommemorativeNftImage)
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useNftAssetDownload(assetUrl), {
      wrapper,
    })
    await act(async () => result.current.download())
    expect(result.current.pending).toBe(false)
    expect(toast.error).toHaveBeenCalledOnce()
    await act(async () => result.current.download())
    expect(downloadCommemorativeNftImage).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledOnce()
  })

  it('aborts on unmount and suppresses late notifications', async () => {
    let resolveResponse: (() => void) | undefined
    const response = new Promise<void>((resolve) => {
      resolveResponse = resolve
    })
    vi.mocked(downloadCommemorativeNftImage).mockReturnValue(response)
    const { result, unmount } = renderHook(
      () => useNftAssetDownload(assetUrl),
      { wrapper },
    )
    let pending: Promise<void> | undefined
    act(() => {
      pending = result.current.download()
    })
    const signal = vi.mocked(downloadCommemorativeNftImage).mock.calls[0]?.[0]
      .signal
    unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      resolveResponse?.()
      await pending
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('aborts and resets a previous owners download when the image URL changes', async () => {
    let resolveOld: (() => void) | undefined
    vi.mocked(downloadCommemorativeNftImage)
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockResolvedValueOnce(undefined)
    const { result, rerender } = renderHook(
      ({ url }) => useNftAssetDownload(url),
      {
        wrapper,
        initialProps: { url: assetUrl },
      },
    )
    let oldDownload: Promise<void> | undefined
    act(() => {
      oldDownload = result.current.download()
    })
    const signal = vi.mocked(downloadCommemorativeNftImage).mock.calls[0]?.[0]
      .signal
    rerender({ url: 'https://assets.example/another-owner.webp' })
    expect(signal?.aborted).toBe(true)
    expect(result.current.pending).toBe(false)
    await act(async () => {
      resolveOld?.()
      await oldDownload
    })
    expect(toast.success).not.toHaveBeenCalled()
    await act(async () => result.current.download())
    expect(downloadCommemorativeNftImage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        assetUrl: 'https://assets.example/another-owner.webp',
      }),
    )
    expect(toast.success).toHaveBeenCalledOnce()
  })
})
