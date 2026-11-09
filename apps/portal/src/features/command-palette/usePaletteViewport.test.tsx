import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePaletteViewport } from './usePaletteViewport'

class TestViewport extends EventTarget {
  height = 500
  offsetTop = 0
}

const Surface = ({
  isOpen = true,
  isMobile = true,
}: {
  readonly isOpen?: boolean
  readonly isMobile?: boolean
}) => {
  const viewportRef = usePaletteViewport({ isOpen, isMobile })
  return <div ref={viewportRef} data-testid="surface" />
}

describe('usePaletteViewport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('tracks keyboard viewport height and panning, then detaches when leaving mobile presentation', () => {
    const viewport = new TestViewport()
    vi.stubGlobal('visualViewport', viewport)
    const { rerender } = render(<Surface />)
    const surface = screen.getByTestId('surface')
    expect(surface.style.getPropertyValue('--palette-viewport-height')).toBe(
      '500px',
    )

    viewport.height = 280
    viewport.dispatchEvent(new Event('resize'))
    expect(surface.style.getPropertyValue('--palette-viewport-height')).toBe(
      '280px',
    )
    viewport.offsetTop = 35
    viewport.dispatchEvent(new Event('scroll'))
    expect(surface.style.getPropertyValue('--palette-viewport-top')).toBe(
      '35px',
    )

    rerender(<Surface isMobile={false} />)
    expect(surface.style.getPropertyValue('--palette-viewport-height')).toBe('')
    expect(surface.style.getPropertyValue('--palette-viewport-top')).toBe('')
    viewport.height = 420
    viewport.dispatchEvent(new Event('resize'))
    expect(surface.style.getPropertyValue('--palette-viewport-height')).toBe('')
  })

  it('keeps viewport styles absent when the API is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined)
    render(<Surface />)
    expect(
      screen
        .getByTestId('surface')
        .style.getPropertyValue('--palette-viewport-height'),
    ).toBe('')
  })
})
