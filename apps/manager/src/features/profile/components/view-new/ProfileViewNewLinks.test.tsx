import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { ProfileLinksSection } from './ProfileViewNewLinks'

const getLinkPatternPanel = (link: HTMLElement) =>
  link.querySelector('[data-link-pattern-id]') as HTMLElement | null

describe('ProfileLinksSection', () => {
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
    expect(firstLink).toHaveClass('h-51.25', 'overflow-hidden')
    expect(patternPanel).toBeInTheDocument()
    expect(patternPanel).toHaveStyle({
      backgroundPosition: 'left top',
      backgroundRepeat: 'repeat',
      backgroundSize: '80px 80px',
    })
    expect((patternPanel as HTMLElement).style.backgroundImage).toContain(
      'data:image/svg+xml',
    )
    expect((patternPanel as HTMLElement).style.backgroundImage).not.toContain(
      'link-pattern',
    )
    expect(patternPanel).toHaveAttribute('data-link-pattern-palette-id')
    expect(firstLink.querySelector('img')).not.toBeInTheDocument()
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
    const firstPattern = firstPatternPanel?.style.backgroundImage
    const firstPatternId = firstPatternPanel?.getAttribute(
      'data-link-pattern-id',
    )
    const firstPaletteId = firstPatternPanel?.getAttribute(
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

    expect(secondPatternPanel?.style.backgroundImage).toBe(firstPattern)
    expect(secondPatternPanel?.getAttribute('data-link-pattern-id')).toBe(
      firstPatternId,
    )
    expect(
      secondPatternPanel?.getAttribute('data-link-pattern-palette-id'),
    ).toBe(firstPaletteId)
  })
})
