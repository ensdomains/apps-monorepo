import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NameAvatar } from './NameAvatar'

let avatarUrl = 'https://example.com/broken.png'

vi.mock('wagmi', () => ({
  useEnsAvatar: () => ({ data: avatarUrl, error: null, isLoading: false }),
}))

describe('NameAvatar', () => {
  it('swaps a failed avatar image for the placeholder, and retries a new URL', () => {
    avatarUrl = 'https://example.com/broken.png'
    const { rerender } = render(<NameAvatar name="alice.eth" />)

    fireEvent.error(screen.getByRole('img', { name: 'avatar' }))

    expect(screen.queryByRole('img', { name: 'avatar' })).toBeNull()
    expect(screen.getByText('alice.eth')).toBeInTheDocument()

    avatarUrl = 'https://example.com/fixed.png'
    rerender(<NameAvatar name="alice.eth" />)

    expect(screen.getByRole('img', { name: 'avatar' })).toHaveAttribute(
      'src',
      'https://example.com/fixed.png',
    )
  })
})
