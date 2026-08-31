import { act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { render, stubImagePreload } from '@/utils/test-utils'
import * as ImageFallback from './ImageFallback'

const renderImageWithFallback = (
  src: string | undefined,
  onLoadingStatusChange: (status: string) => void,
) =>
  render(
    <ImageFallback.Root>
      <ImageFallback.Image
        alt=""
        onLoadingStatusChange={onLoadingStatusChange}
        src={src}
      />
      <ImageFallback.Fallback>
        <span>fallback</span>
      </ImageFallback.Fallback>
    </ImageFallback.Root>,
  )

describe('ImageFallback', () => {
  const probes = stubImagePreload()

  it('reports error and keeps the fallback when the request fails', () => {
    const statusSpy = vi.fn()
    const { container, getByText } = renderImageWithFallback(
      'https://example.com/missing.png',
      statusSpy,
    )

    expect(statusSpy).toHaveBeenLastCalledWith('loading')

    act(() => {
      probes[0]?.dispatchEvent(new Event('error'))
    })

    expect(statusSpy).toHaveBeenLastCalledWith('error')
    expect(getByText('fallback')).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('reports loaded and swaps the fallback for the image', () => {
    const statusSpy = vi.fn()
    const src = 'https://example.com/avatar.png'
    const { container, queryByText } = renderImageWithFallback(src, statusSpy)

    act(() => {
      probes[0]?.dispatchEvent(new Event('load'))
    })

    expect(statusSpy).toHaveBeenLastCalledWith('loaded')
    expect(container.querySelector(`img[src="${src}"]`)).toBeInTheDocument()
    expect(queryByText('fallback')).not.toBeInTheDocument()
  })

  it('reports error immediately when no src is given', () => {
    const statusSpy = vi.fn()
    const { getByText } = renderImageWithFallback(undefined, statusSpy)

    expect(statusSpy).toHaveBeenLastCalledWith('error')
    expect(getByText('fallback')).toBeInTheDocument()
  })
})
