import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { ProfileLinksSection } from './ProfileViewNewLinks'

describe('ProfileLinksSection', () => {
  it('does not render placeholder cards when there are no links', () => {
    const { container } = render(
      <ProfileLinksSection records={newEmptyProfileRecords()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders link records with the Figma default fallback card treatment', () => {
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
    const patternPanel = firstLink.querySelector(
      '[data-figma-pattern-source-id="3749:29667"]',
    )
    expect(firstLink).toHaveAttribute('href', 'https://myblogwebsite.com')
    expect(firstLink).toHaveClass('h-51.25', 'overflow-hidden')
    expect(patternPanel).toBeInTheDocument()
    expect(patternPanel).toHaveStyle({
      backgroundPosition: 'left top',
      backgroundRepeat: 'repeat',
      backgroundSize: '80px 80px',
    })
    expect(
      container.querySelector('[data-figma-pattern-source-id="3749:35715"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-figma-pattern-source-id="3749:30577"]'),
    ).toBeInTheDocument()
    expect(firstLink.querySelector('img')).not.toBeInTheDocument()
    expect(firstLink.querySelector('.lucide-link')).not.toBeInTheDocument()
    expect(container.querySelectorAll('a')).toHaveLength(3)
  })
})
