import { describe, expect, it } from 'vitest'

import { render } from '@/utils/test-utils'
import { PatternAvatar } from './PatternAvatar'

const getRectSignature = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('rect'))
    .map((rect) => ({
      x: rect.getAttribute('x'),
      y: rect.getAttribute('y'),
      width: rect.getAttribute('width'),
      height: rect.getAttribute('height'),
    }))
    .sort((a, b) => `${a.x}-${a.y}`.localeCompare(`${b.x}-${b.y}`))

const getStopColors = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('stop')).map((stop) =>
    stop.getAttribute('stop-color'),
  )

describe('PatternAvatar', () => {
  it('renders an accessible pattern svg', () => {
    const { getByRole } = render(<PatternAvatar name="vitalik.eth" />)

    expect(
      getByRole('img', { name: 'vitalik.eth pattern' }),
    ).toBeInTheDocument()
  })

  it('is deterministic for the same name', () => {
    const first = render(<PatternAvatar name="coderoaster.eth" />)
    const firstRects = getRectSignature(first.container)
    const firstColors = getStopColors(first.container)
    first.unmount()

    const second = render(<PatternAvatar name="coderoaster.eth" />)
    const secondRects = getRectSignature(second.container)
    const secondColors = getStopColors(second.container)

    expect(secondRects).toEqual(firstRects)
    expect(secondColors).toEqual(firstColors)
  })

  it('changes pattern for a different name', () => {
    const first = render(<PatternAvatar name="coderoaster.eth" />)
    const second = render(<PatternAvatar name="ens.eth" />)

    expect(getRectSignature(second.container)).not.toEqual(
      getRectSignature(first.container),
    )
  })
})
