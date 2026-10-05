import { fireEvent, render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a href={to} data-params={JSON.stringify(params)}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/components/CopyableRecord', () => ({
  CopyableRecord: ({ value, href }: { value: string; href: string }) => (
    <a href={href} data-testid="copyable-record">
      {value}
    </a>
  ),
}))

vi.mock('@/components/table/SortButton', () => ({
  SortButton: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick} data-testid="sort-button">
      {children}
    </button>
  ),
}))

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: ({ name }: { name: string }) => (
    <div data-testid="name-avatar">{name}</div>
  ),
}))

vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({
    children,
    name,
    variant,
    showAvatar,
  }: {
    children: React.ReactNode
    name?: string
    variant?: string
    showAvatar?: boolean
  }) => (
    <span data-testid="entity-badge">
      {showAvatar && variant === 'name' && name ? (
        <span data-testid="name-avatar">{name}</span>
      ) : null}
      {children}
    </span>
  ),
}))

vi.mock('@/utils/formatting/truncateAddress', () => ({
  truncateAddress: (address: string) => `${address.slice(0, 6)}...`,
}))

const { SubnamesTable } = await import('./SubnamesTable')

const createMockSubname = (
  name: string,
  owner: Address = '0x1234567890123456789012345678901234567890',
) => ({
  name,
  owner,
})

describe('SubnamesTable', () => {
  it('renders the header with title and search input', () => {
    render(
      <SubnamesTable
        subnames={[createMockSubname('sub1.test.eth')]}
        name="test.eth"
      />,
    )

    expect(screen.getByText('Subnames (1)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })

  it('renders empty state without search input when no subnames', () => {
    render(<SubnamesTable subnames={[]} name="test.eth" />)

    expect(screen.getByText('Subnames')).toBeInTheDocument()
    expect(screen.getByText('No subnames yet')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument()
  })

  it('renders subnames in the table', () => {
    const subnames = [
      createMockSubname('sub1.test.eth'),
      createMockSubname('sub2.test.eth'),
    ]

    render(<SubnamesTable subnames={subnames} name="test.eth" />)

    expect(screen.getAllByText('sub1.test.eth').length).toBeGreaterThan(0)
    expect(screen.getAllByText('sub2.test.eth').length).toBeGreaterThan(0)
  })

  it('renders sort buttons for columns', () => {
    render(<SubnamesTable subnames={[]} name="test.eth" />)

    const sortButtons = screen.getAllByTestId('sort-button')
    expect(sortButtons.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Subname')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
  })

  it('filters subnames when searching', () => {
    const subnames = [
      createMockSubname('alice.test.eth'),
      createMockSubname('bob.test.eth'),
      createMockSubname('charlie.test.eth'),
    ]

    render(<SubnamesTable subnames={subnames} name="test.eth" />)

    const searchInput = screen.getByPlaceholderText('Search...')
    fireEvent.change(searchInput, { target: { value: 'alice' } })

    expect(screen.getAllByText('alice.test.eth').length).toBeGreaterThan(0)
    expect(screen.queryByText('bob.test.eth')).not.toBeInTheDocument()
    expect(screen.queryByText('charlie.test.eth')).not.toBeInTheDocument()
  })

  it('shows all subnames when search is cleared', () => {
    const subnames = [
      createMockSubname('alice.test.eth'),
      createMockSubname('bob.test.eth'),
    ]

    render(<SubnamesTable subnames={subnames} name="test.eth" />)

    const searchInput = screen.getByPlaceholderText('Search...')

    // Filter to show only alice
    fireEvent.change(searchInput, { target: { value: 'alice' } })
    expect(screen.queryByText('bob.test.eth')).not.toBeInTheDocument()

    // Clear filter
    fireEvent.change(searchInput, { target: { value: '' } })
    expect(screen.getAllByText('alice.test.eth').length).toBeGreaterThan(0)
    expect(screen.getAllByText('bob.test.eth').length).toBeGreaterThan(0)
  })

  it('renders name avatars for each subname', () => {
    const subnames = [
      createMockSubname('sub1.test.eth'),
      createMockSubname('sub2.test.eth'),
    ]

    render(<SubnamesTable subnames={subnames} name="test.eth" />)

    const avatars = screen.getAllByTestId('name-avatar')
    expect(avatars.length).toBeGreaterThan(0)
  })

  it('renders create button when canCreateSubname is true', () => {
    render(<SubnamesTable subnames={[]} name="test.eth" canCreateSubname />)

    expect(screen.getByText('Create subname')).toBeInTheDocument()
  })

  it('does not render create button when canCreateSubname is false', () => {
    render(
      <SubnamesTable subnames={[]} name="test.eth" canCreateSubname={false} />,
    )

    expect(screen.queryByText('Create subname')).not.toBeInTheDocument()
  })

  // A V2 name can hold thousands of subnames, so the table is handed a page at
  // a time; the heading still reports how many the name has.
  describe('with more subnames than are loaded', () => {
    const loaded = [
      createMockSubname('sub1.test.eth'),
      createMockSubname('sub2.test.eth'),
    ]

    it('heads the page with the name’s total, not the loaded rows', () => {
      render(
        <SubnamesTable
          subnames={loaded}
          totalCount={10181}
          onLoadMore={vi.fn()}
          name="test.eth"
        />,
      )

      expect(screen.getByText('Subnames (10181)')).toBeInTheDocument()
      expect(screen.getByText('Showing 2 of 10181')).toBeInTheDocument()
    })

    it('loads the next page on request', () => {
      const onLoadMore = vi.fn()
      render(
        <SubnamesTable
          subnames={loaded}
          totalCount={10181}
          onLoadMore={onLoadMore}
          name="test.eth"
        />,
      )

      fireEvent.click(
        screen.getByRole('button', { name: 'Load more subnames' }),
      )

      expect(onLoadMore).toHaveBeenCalledOnce()
    })

    it('holds the button while a page is loading', () => {
      render(
        <SubnamesTable
          subnames={loaded}
          totalCount={10181}
          onLoadMore={vi.fn()}
          isLoadingMore
          name="test.eth"
        />,
      )

      expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled()
    })

    // The filter only sees loaded rows, so an empty result is not "no such
    // subname" while there are more to load.
    it('says a search covers only the loaded rows', () => {
      render(
        <SubnamesTable
          subnames={loaded}
          totalCount={10181}
          onLoadMore={vi.fn()}
          name="test.eth"
        />,
      )

      fireEvent.change(screen.getByPlaceholderText('Search...'), {
        target: { value: 'sub9' },
      })

      expect(
        screen.getByText(/Searching the 2 subnames loaded so far/),
      ).toBeInTheDocument()
    })

    it('offers nothing more once every subname is loaded', () => {
      render(<SubnamesTable subnames={loaded} name="test.eth" />)

      expect(screen.getByText('Subnames (2)')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Load more subnames' }),
      ).not.toBeInTheDocument()
    })
  })
})
