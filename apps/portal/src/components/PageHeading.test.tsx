import { render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    className?: string
  }) => (
    <a
      href={to}
      data-params={JSON.stringify(params)}
      className={className}
      data-testid="router-link"
    >
      {children}
    </a>
  ),
}))

const { PageHeading } = await import('./PageHeading')

const ADDRESS = '0x7A824BEa2Bed9399a68cD0e340224809521c81D9' as Address

describe('PageHeading', () => {
  it('renders the page title after a breadcrumb back to the name overview', () => {
    render(
      <PageHeading parent={{ type: 'name', name: 'jooooe.eth' }}>
        Address resolution
      </PageHeading>,
    )

    // The `/` is aria-hidden, so the heading reads as its two real segments.
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'jooooe.eth Address resolution',
      }),
    ).toBeInTheDocument()

    const link = screen.getByTestId('router-link')
    expect(link).toHaveAttribute('href', '/$name')
    expect(link).toHaveAttribute(
      'data-params',
      JSON.stringify({ name: 'jooooe.eth' }),
    )
    // Hover is an underline rather than a colour shift (Figma 2471:43259).
    expect(link).toHaveClass('hover:underline')
  })

  it('renders no breadcrumb on an overview page', () => {
    render(<PageHeading>Registry Contract</PageHeading>)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Registry Contract' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('router-link')).not.toBeInTheDocument()
  })

  it('labels each crumb with the title of the overview it links to', () => {
    const cases = [
      {
        parent: { type: 'addr', addr: ADDRESS } as const,
        href: '/addr/$addr',
        label: '0x7A82…81D9',
      },
      {
        parent: { type: 'registry', address: ADDRESS } as const,
        href: '/registry/$address',
        label: 'Registry Contract',
      },
      {
        parent: { type: 'resolver', address: ADDRESS } as const,
        href: '/resolver/$address',
        label: 'Resolver 0x7A82…81D9',
      },
    ]

    for (const { parent, href, label } of cases) {
      const { unmount } = render(
        <PageHeading parent={parent}>History</PageHeading>,
      )

      const link = screen.getByTestId('router-link')
      expect(link).toHaveTextContent(label)
      expect(link).toHaveAttribute('href', href)

      unmount()
    }
  })
})
