import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NameAvatar } from './NameAvatar'

let avatarError: Error | null = null
let isAvatarLoading = false
let avatarUrl = 'https://example.com/broken.png'

vi.mock('wagmi', () => ({
  useEnsAvatar: () => ({
    data: avatarUrl,
    error: avatarError,
    isLoading: isAvatarLoading,
  }),
}))

describe('NameAvatar', () => {
  beforeEach(() => {
    avatarError = null
    isAvatarLoading = false
  })
  it('shows the branded fallback after a settled lookup error', () => {
    avatarError = new Error('Lookup failed')
    render(<NameAvatar name="error.eth" />)
    expect(screen.getByText('error.eth')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('waits for an in-progress lookup before showing a fallback', () => {
    isAvatarLoading = true
    const { rerender } = render(<NameAvatar name="loading.eth" />)
    expect(screen.queryByText('loading.eth')).toBeNull()
    isAvatarLoading = false
    avatarError = new Error('Lookup failed')
    rerender(<NameAvatar name="loading.eth" />)
    expect(screen.getByText('loading.eth')).toBeInTheDocument()
  })

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
