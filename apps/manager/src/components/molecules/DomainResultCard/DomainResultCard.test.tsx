import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { DomainResultCard } from './DomainResultCard'

const originalImage = window.Image
const pendingImages: PendingImage[] = []

class PendingImage extends EventTarget {
  complete = false
  naturalWidth = 0
  src = ''

  constructor() {
    super()
    pendingImages.push(this)
  }
}

describe('DomainResultCard', () => {
  beforeEach(() => {
    pendingImages.length = 0
    window.Image = PendingImage as unknown as typeof window.Image
  })

  afterEach(() => {
    window.Image = originalImage
  })

  it('shows the name pattern while its avatar loads, then shows the avatar', async () => {
    render(
      <DomainResultCard
        avatarUrl="https://example.com/alien.png"
        domainName="alien.eth"
        status="registered"
      />,
    )

    expect(
      screen.getByRole('img', { name: 'alien.eth pattern' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: 'alien.eth avatar' }),
    ).not.toBeInTheDocument()

    act(() => {
      const image = pendingImages[0]
      if (!image) throw new Error('Expected an avatar image request')
      image.complete = true
      image.naturalWidth = 1
      image.dispatchEvent(new Event('load'))
    })

    const avatar = await screen.findByRole('img', {
      name: 'alien.eth avatar',
    })
    expect(avatar).toHaveAttribute('src', 'https://example.com/alien.png')
    expect(
      screen.queryByRole('img', { name: 'alien.eth pattern' }),
    ).not.toBeInTheDocument()
  })

  it('shows the name pattern when no avatar record is present', () => {
    render(<DomainResultCard domainName="no-avatar.eth" status="registered" />)

    expect(
      screen.getByRole('img', { name: 'no-avatar.eth pattern' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: 'no-avatar.eth avatar' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the name pattern when the avatar request fails', () => {
    render(
      <DomainResultCard
        avatarUrl="https://example.com/missing.png"
        domainName="broken-avatar.eth"
        status="registered"
      />,
    )

    act(() => {
      const image = pendingImages[0]
      if (!image) throw new Error('Expected an avatar image request')
      image.dispatchEvent(new Event('error'))
    })

    expect(
      screen.getByRole('img', { name: 'broken-avatar.eth pattern' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: 'broken-avatar.eth avatar' }),
    ).not.toBeInTheDocument()
  })

  it('shows the pattern avatar for a name in its grace period', () => {
    render(<DomainResultCard domainName="earl.eth" status="grace" />)

    expect(
      screen.getByRole('img', { name: 'earl.eth pattern' }),
    ).toBeInTheDocument()
  })

  it('renders no avatar for an available name', () => {
    render(
      <DomainResultCard domainName="earl.eth" price={5} status="available" />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders no avatar while the availability check is loading', () => {
    render(
      <DomainResultCard domainName="earl.eth" isLoading status="registered" />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
