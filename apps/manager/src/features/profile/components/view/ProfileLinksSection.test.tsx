import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { ProfileLinksSection } from './ProfileLinksSection'

const getLinkPatternPanel = (link: HTMLElement) =>
  within(link).getByTestId('link-pattern-panel')

describe('ProfileLinksSection', () => {
  beforeEach(() => {
    // These existing rendering checks exercise cards after they enter view.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private callback: IntersectionObserverCallback) {}
        observe() {
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          )
        }
        disconnect() {}
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not render placeholder cards when there are no links', () => {
    const { container } = render(
      <ProfileLinksSection records={newEmptyProfileRecords()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders link records with generated Figma-style SVG pattern cards', () => {
    const records = {
      ...newEmptyProfileRecords(),
      links: [
        { name: 'My Blog', url: 'myblogwebsite.com' },
        { name: 'Portfolio', url: 'https://portfolio.example' },
        { name: 'Archive', url: 'https://arena.example' },
      ],
    }

    const { container } = render(
      <div>
        <ProfileLinksSection records={records} />
      </div>,
    )

    const firstLink = screen.getByRole('link', { name: /My Blog/ })
    const patternPanel = getLinkPatternPanel(firstLink)
    expect(firstLink).toHaveAttribute('href', 'https://myblogwebsite.com')
    expect(firstLink).toHaveClass('overflow-hidden')
    expect(patternPanel).toBeInTheDocument()
    expect(patternPanel).toHaveStyle({
      backgroundPosition: 'left top',
      backgroundRepeat: 'repeat',
      backgroundSize: '80px 80px',
    })
    expect(patternPanel.style.backgroundImage).toContain('data:image/svg+xml')
    expect(patternPanel.style.backgroundImage).not.toContain('link-pattern')
    expect(patternPanel).toHaveAttribute('data-link-pattern-palette-id')
    expect(firstLink.querySelector('img')).not.toBeVisible()
    expect(firstLink.querySelector('.lucide-link')).not.toBeInTheDocument()
    expect(container.querySelectorAll('a')).toHaveLength(3)
  })

  it('generates the same pattern for the same URL regardless of card order', () => {
    const targetLink = { name: 'Same URL', url: 'https://same.example' }
    const first = render(
      <ProfileLinksSection
        records={{
          ...newEmptyProfileRecords(),
          links: [
            targetLink,
            { name: 'Other URL', url: 'https://other.example' },
          ],
        }}
      />,
    )

    const firstPatternPanel = getLinkPatternPanel(
      screen.getByRole('link', { name: /Same URL/ }),
    )
    const firstPattern = firstPatternPanel.style.backgroundImage
    const firstPatternId = firstPatternPanel.getAttribute(
      'data-link-pattern-id',
    )
    const firstPaletteId = firstPatternPanel.getAttribute(
      'data-link-pattern-palette-id',
    )
    first.unmount()

    render(
      <ProfileLinksSection
        records={{
          ...newEmptyProfileRecords(),
          links: [
            { name: 'Other URL', url: 'https://other.example' },
            targetLink,
          ],
        }}
      />,
    )

    const secondPatternPanel = getLinkPatternPanel(
      screen.getByRole('link', { name: /Same URL/ }),
    )

    expect(secondPatternPanel.style.backgroundImage).toBe(firstPattern)
    expect(secondPatternPanel.getAttribute('data-link-pattern-id')).toBe(
      firstPatternId,
    )
    expect(
      secondPatternPanel.getAttribute('data-link-pattern-palette-id'),
    ).toBe(firstPaletteId)
  })

  it('generates different pattern output for different URLs', () => {
    render(
      <ProfileLinksSection
        records={{
          ...newEmptyProfileRecords(),
          links: [
            { name: 'GitHub', url: 'https://github.com' },
            { name: 'Hey', url: 'https://hey.com' },
          ],
        }}
      />,
    )

    const githubPatternPanel = getLinkPatternPanel(
      screen.getByRole('link', { name: /GitHub/ }),
    )
    const heyPatternPanel = getLinkPatternPanel(
      screen.getByRole('link', { name: /Hey/ }),
    )

    expect(githubPatternPanel.style.backgroundImage).not.toBe(
      heyPatternPanel.style.backgroundImage,
    )
    expect(githubPatternPanel.getAttribute('data-link-pattern-id')).not.toBe(
      heyPatternPanel.getAttribute('data-link-pattern-id'),
    )
  })

  it('reveals a worker-served OG image only after it loads', () => {
    render(
      <ProfileLinksSection
        records={{
          ...newEmptyProfileRecords(),
          links: [{ name: 'Blog', url: 'https://example.com/blog' }],
        }}
      />,
    )
    const link = screen.getByRole('link', { name: /Blog/ })
    const image = link.querySelector('img')
    expect(image).not.toBeNull()
    expect(image).not.toBeVisible()
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image?.getAttribute('src')).toContain(
      '/link-preview/image?url=https%3A%2F%2Fexample.com%2Fblog',
    )
    if (!image) throw new Error('Missing OG image')
    fireEvent.load(image)
    expect(image).toBeVisible()
    fireEvent.error(image)
    expect(link.querySelector('img')).not.toBeInTheDocument()
    expect(getLinkPatternPanel(link).style.backgroundImage).toContain(
      'data:image/svg+xml',
    )
  })

  it('waits until near the viewport before mounting the image', () => {
    let onIntersect: IntersectionObserverCallback = () => {}
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          onIntersect = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    render(
      <ProfileLinksSection
        records={{
          ...newEmptyProfileRecords(),
          links: [{ name: 'Blog', url: 'https://example.com/blog' }],
        }}
      />,
    )
    const link = screen.getByRole('link', { name: /Blog/ })
    expect(link.querySelector('img')).not.toBeInTheDocument()
    act(() =>
      onIntersect(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    )
    expect(link.querySelector('img')?.getAttribute('src')).toContain(
      '/link-preview/image?url=',
    )
  })

  it('resets a failed image when the link URL changes', () => {
    const records = {
      ...newEmptyProfileRecords(),
      links: [{ name: 'Blog', url: 'https://example.com/old' }],
    }
    const { rerender } = render(<ProfileLinksSection records={records} />)
    const oldImage = screen
      .getByRole('link', { name: /Blog/ })
      .querySelector('img')
    if (!oldImage) throw new Error('Missing OG image')
    fireEvent.error(oldImage)
    rerender(
      <ProfileLinksSection
        records={{
          ...records,
          links: [{ name: 'Blog', url: 'https://example.com/new' }],
        }}
      />,
    )
    const newImage = screen
      .getByRole('link', { name: /Blog/ })
      .querySelector('img')
    expect(newImage?.getAttribute('src')).toContain(
      'https%3A%2F%2Fexample.com%2Fnew',
    )
    expect(newImage).not.toBeVisible()
  })
})
