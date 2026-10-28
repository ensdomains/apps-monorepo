import { update } from '@intercom/messenger-js-sdk'
import { act, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIntercomClearance } from './useIntercomClearance'

vi.mock('@intercom/messenger-js-sdk', () => ({ update: vi.fn() }))

const BAR_HEIGHT = 90

const Bar = () => {
  const [bar, setBar] = useState<HTMLElement | null>(null)
  useIntercomClearance(bar)
  return <nav ref={setBar} />
}

const mockBar = (
  height: number,
  {
    left = 0,
    right = window.innerWidth,
  }: { left?: number; right?: number } = {},
) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height,
    left,
    right,
    top: 800 - height,
  } as DOMRect)

describe('useIntercomClearance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(update).mockClear()
    vi.stubGlobal('innerHeight', 800)
    vi.stubGlobal('innerWidth', 1200)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    mockBar(BAR_HEIGHT)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('lifts the launcher above the bar and resets on unmount', () => {
    const launcherBottom = () =>
      document.documentElement.style.getPropertyValue(
        '--intercom-launcher-bottom',
      )
    const { unmount } = render(<Bar />)

    expect(update).toHaveBeenLastCalledWith({
      vertical_padding: BAR_HEIGHT + 16,
    })
    expect(launcherBottom()).toBe(`${BAR_HEIGHT + 16}px`)

    unmount()

    expect(update).toHaveBeenLastCalledWith({ vertical_padding: 20 })
    expect(launcherBottom()).toBe('20px')
  })

  it('keeps the default padding while the bar is display:none', () => {
    mockBar(0)

    render(<Bar />)

    expect(update).toHaveBeenLastCalledWith({ vertical_padding: 20 })
  })

  it.each([
    { side: 'left', left: 100, right: 1120 },
    { side: 'right', left: 1180, right: 1200 },
  ])(
    'keeps the default padding for a bar to the $side of the launcher',
    ({ left, right }) => {
      mockBar(BAR_HEIGHT, { left, right })

      render(<Bar />)

      expect(update).toHaveBeenLastCalledWith({ vertical_padding: 20 })
    },
  )

  it('updates padding as resizing moves the launcher into and out of overlap', () => {
    mockBar(BAR_HEIGHT, { left: 100, right: 1000 })

    render(<Bar />)

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenLastCalledWith({ vertical_padding: 20 })

    act(() => {
      vi.stubGlobal('innerWidth', 1000)
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(200)
    })

    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenLastCalledWith({
      vertical_padding: BAR_HEIGHT + 16,
    })

    act(() => {
      vi.stubGlobal('innerWidth', 1200)
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(200)
    })

    expect(update).toHaveBeenCalledTimes(3)
    expect(update).toHaveBeenLastCalledWith({ vertical_padding: 20 })
  })

  it('only tells Intercom when the settled clearance changed', () => {
    render(<Bar />)
    expect(update).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(200)
    })
    expect(update).toHaveBeenCalledTimes(1)

    mockBar(BAR_HEIGHT + 40)
    act(() => {
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(200)
    })
    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenLastCalledWith({
      vertical_padding: BAR_HEIGHT + 40 + 16,
    })
  })
})
