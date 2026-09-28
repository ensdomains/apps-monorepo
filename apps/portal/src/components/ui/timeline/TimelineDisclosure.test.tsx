import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TimelineDisclosure } from './TimelineDisclosure'

describe('TimelineDisclosure', () => {
  it('takes collapsed content out of focus and the accessibility tree', () => {
    const { rerender } = render(
      <TimelineDisclosure isOpen>
        <a href="/x">link</a>
      </TimelineDisclosure>,
    )
    expect(screen.getByText('link').closest('[inert]')).toBeNull()

    rerender(
      <TimelineDisclosure isOpen={false}>
        <a href="/x">link</a>
      </TimelineDisclosure>,
    )
    expect(screen.getByText('link').closest('[inert]')).not.toBeNull()
  })
})
