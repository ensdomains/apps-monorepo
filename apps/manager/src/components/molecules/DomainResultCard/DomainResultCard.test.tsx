import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render, stubImagePreload } from '@/utils/test-utils'
import { DomainResultCard } from './DomainResultCard'

// The whole avatar slot is decorative (aria-hidden), so its images are
// asserted straight from the DOM rather than through accessible roles.
const queryPatternImage = (container: HTMLElement, domainName: string) =>
  container.querySelector(`img[alt="${domainName} pattern"]`)
const queryAvatarImage = (container: HTMLElement, src: string) =>
  container.querySelector(`img[src="${src}"]`)

describe('DomainResultCard', () => {
  const probes = stubImagePreload()

  it('shows the name pattern while its avatar loads, then shows the avatar', () => {
    const avatarUrl = 'https://example.com/alien.png'
    const { container } = render(
      <DomainResultCard
        avatarUrl={avatarUrl}
        domainName="alien.eth"
        status="registered"
      />,
    )

    expect(queryPatternImage(container, 'alien.eth')).toBeInTheDocument()
    expect(queryAvatarImage(container, avatarUrl)).not.toBeInTheDocument()

    const probe = probes[0]
    if (!probe) throw new Error('Expected an avatar image request')
    expect(probe.src).toBe(avatarUrl)

    act(() => {
      probe.dispatchEvent(new Event('load'))
    })

    expect(queryAvatarImage(container, avatarUrl)).toBeInTheDocument()
    expect(queryPatternImage(container, 'alien.eth')).not.toBeInTheDocument()
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(container.querySelector('img[alt=""]')).toBeInTheDocument()
  })

  it('keeps every image out of the accessibility tree', () => {
    const avatarUrl = 'https://example.com/alien.png'
    const { container } = render(
      <DomainResultCard
        avatarUrl={avatarUrl}
        domainName="alien.eth"
        status="registered"
      />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    const probe = probes[0]
    if (!probe) throw new Error('Expected an avatar image request')

    act(() => {
      probe.dispatchEvent(new Event('load'))
    })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('img[alt=""]')).toBeInTheDocument()
  })

  it('tints the pattern with the theme record and shrugs off malformed values', () => {
    const patternSrc = (themeColor: string | undefined) => {
      const { container, unmount } = render(
        <DomainResultCard
          domainName="earl.eth"
          status="registered"
          themeColor={themeColor}
        />,
      )
      const src = queryPatternImage(container, 'earl.eth')?.getAttribute('src')
      unmount()
      if (!src) throw new Error('Expected a pattern image')
      return src
    }

    const defaultTint = patternSrc(undefined)
    const themedTint = patternSrc('#E72A96')

    expect(themedTint).not.toBe(defaultTint)
    // Attacker-controlled record values must never throw: non-hex values
    // fall back to the default tint, and padded hex is trimmed.
    expect(patternSrc('red')).toBe(defaultTint)
    expect(patternSrc('')).toBe(defaultTint)
    expect(patternSrc(' #E72A96 ')).toBe(themedTint)
  })

  it('drops the theme tint for a name in its grace period', () => {
    const { container } = render(
      <DomainResultCard
        domainName="earl.eth"
        status="grace"
        themeColor="#E72A96"
      />,
    )
    const graceSrc = queryPatternImage(container, 'earl.eth')?.getAttribute(
      'src',
    )

    const { container: registeredContainer } = render(
      <DomainResultCard domainName="earl.eth" status="registered" />,
    )
    const defaultSrc = queryPatternImage(
      registeredContainer,
      'earl.eth',
    )?.getAttribute('src')

    expect(graceSrc).toBeDefined()
    expect(graceSrc).toBe(defaultSrc)
  })

  it('shows the name pattern when no avatar url is passed', () => {
    const { container } = render(
      <DomainResultCard domainName="no-avatar.eth" status="registered" />,
    )

    expect(queryPatternImage(container, 'no-avatar.eth')).toBeInTheDocument()
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  // The loading and error states render identically by design; the error
  // path's own oracle lives in ImageFallback.test.tsx, where the atom's
  // onLoadingStatusChange prop can observe the transition.
  it('keeps the name pattern when the avatar request fails', () => {
    const avatarUrl = 'https://example.com/missing.png'
    const { container } = render(
      <DomainResultCard
        avatarUrl={avatarUrl}
        domainName="broken-avatar.eth"
        status="registered"
      />,
    )

    const probe = probes[0]
    if (!probe) throw new Error('Expected an avatar image request')
    expect(probe.src).toBe(avatarUrl)

    act(() => {
      probe.dispatchEvent(new Event('error'))
    })

    expect(
      queryPatternImage(container, 'broken-avatar.eth'),
    ).toBeInTheDocument()
    expect(queryAvatarImage(container, avatarUrl)).not.toBeInTheDocument()
  })

  it('renders the avatar for a name in grace exactly like a registered one', () => {
    const avatarUrl = 'https://example.com/earl.png'
    const { container } = render(
      <DomainResultCard
        avatarUrl={avatarUrl}
        domainName="earl.eth"
        status="grace"
      />,
    )

    expect(queryPatternImage(container, 'earl.eth')).toBeInTheDocument()
    expect(screen.getByText('Grace period')).toBeInTheDocument()

    const probe = probes[0]
    if (!probe) throw new Error('Expected an avatar image request')

    act(() => {
      probe.dispatchEvent(new Event('load'))
    })

    expect(queryAvatarImage(container, avatarUrl)).toBeInTheDocument()
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
