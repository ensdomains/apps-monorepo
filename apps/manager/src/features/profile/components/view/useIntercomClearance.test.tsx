import { update } from '@intercom/messenger-js-sdk'
import { render } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIntercomClearance } from './useIntercomClearance'

vi.mock('@intercom/messenger-js-sdk', () => ({ update: vi.fn() }))

const BAR_HEIGHT = 90

const Bar = () => {
  const [bar, setBar] = useState<HTMLElement | null>(null)
  useIntercomClearance(bar)
  return <nav ref={setBar} />
}

describe('useIntercomClearance', () => {
  beforeEach(() => {
    vi.mocked(update).mockClear()
    vi.stubGlobal('innerHeight', 800)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: BAR_HEIGHT,
      top: 800 - BAR_HEIGHT,
    } as DOMRect)
  })

  it('keeps the default padding while the bar is display:none', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 0,
      top: 0,
    } as DOMRect)

    render(<Bar />)

    expect(update).toHaveBeenLastCalledWith({ vertical_padding: 20 })
  })

  it('lifts the launcher above the bar and resets on unmount', () => {
    const { unmount } = render(<Bar />)

    expect(update).toHaveBeenLastCalledWith({
      vertical_padding: BAR_HEIGHT + 16,
    })

    unmount()

    expect(update).toHaveBeenLastCalledWith({ vertical_padding: 20 })
  })
})
