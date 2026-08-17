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

// The loaded avatar is decorative (alt=""), so it is absent from the
// accessibility tree; assert on it directly via the DOM.
const queryAvatarImage = (container: HTMLElement, src: string) =>
  container.querySelector(`img[src="${src}"]`)

describe('DomainResultCard', () => {
  beforeEach(() => {
    pendingImages.length = 0
    window.Image = PendingImage as unknown as typeof window.Image
  })

  afterEach(() => {
    window.Image = originalImage
  })

  it('shows the name pattern while its avatar loads, then shows the avatar', async () => {
    const avatarUrl = 'https://example.com/alien.png'
    const { container } = render(
      <DomainResultCard
        avatarUrl={avatarUrl}
        domainName="alien.eth"
        status="registered"
      />,
    )

    expect(
      screen.getByRole('img', { name: 'alien.eth pattern' }),
    ).toBeInTheDocument()
    expect(queryAvatarImage(container, avatarUrl)).not.toBeInTheDocument()

    const probe = pendingImages[0]
    if (!probe) throw new Error('Expected an avatar image request')
    expect(probe.src).toBe(avatarUrl)

    act(() => {
      probe.complete = true
      probe.naturalWidth = 1
      probe.dispatchEvent(new Event('load'))
    })

    expect(queryAvatarImage(container, avatarUrl)).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: 'alien.eth pattern' }),
    ).not.toBeInTheDocument()
  })

  it('shows the name pattern when no avatar url is passed', () => {
    const { container } = render(
      <DomainResultCard domainName="no-avatar.eth" status="registered" />,
    )

    expect(
      screen.getByRole('img', { name: 'no-avatar.eth pattern' }),
    ).toBeInTheDocument()
    expect(container.querySelector('img[alt=""]')).not.toBeInTheDocument()
  })

  it('keeps the name pattern when the avatar request fails', () => {
    const avatarUrl = 'https://example.com/missing.png'
    const { container } = render(
      <DomainResultCard
        avatarUrl={avatarUrl}
        domainName="broken-avatar.eth"
        status="registered"
      />,
    )

    const probe = pendingImages[0]
    if (!probe) throw new Error('Expected an avatar image request')
    expect(probe.src).toBe(avatarUrl)

    act(() => {
      probe.dispatchEvent(new Event('error'))
    })

    expect(
      screen.getByRole('img', { name: 'broken-avatar.eth pattern' }),
    ).toBeInTheDocument()
    expect(queryAvatarImage(container, avatarUrl)).not.toBeInTheDocument()
  })

  it('renders the pattern avatar and the grace badge for a name in grace', () => {
    render(<DomainResultCard domainName="earl.eth" status="grace" />)

    expect(
      screen.getByRole('img', { name: 'earl.eth pattern' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Grace period')).toBeInTheDocument()
  })

  it('renders no avatar for an available name', () => {
    const { container } = render(
      <DomainResultCard domainName="earl.eth" price={5} status="available" />,
    )

    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('renders no avatar while the availability check is loading', () => {
    const { container } = render(
      <DomainResultCard domainName="earl.eth" isLoading status="registered" />,
    )

    expect(container.querySelector('img')).not.toBeInTheDocument()
  })
})
