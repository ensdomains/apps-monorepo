import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TimelineDisclosure } from './TimelineDisclosure'

describe('TimelineDisclosure', () => {
  it('takes collapsed content out of focus and the accessibility tree', () => {
    const { rerender } = render(
      <TimelineDisclosure isOpen>
        <a href="/docs">ENS docs</a>
      </TimelineDisclosure>,
    )
    expect(screen.getByText('ENS docs').closest('[inert]')).toBeNull()

    rerender(
      <TimelineDisclosure isOpen={false}>
        <a href="/docs">ENS docs</a>
      </TimelineDisclosure>,
    )
    expect(screen.getByText('ENS docs').closest('[inert]')).not.toBeNull()
  })
})
