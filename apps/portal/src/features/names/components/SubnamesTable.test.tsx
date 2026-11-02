import { encodeLabelhash } from '@ensdomains/ensjs/utils'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Address, type Hex, keccak256, labelhash, toHex } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { rememberName } from '@/utils/ens/localLabels'

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

// The real highlight hook, so the tests below see whether the table mounts its
// provider.
vi.mock('@/components/EntityBadge', async () => {
  const { useAddressHighlight } = await vi.importActual<
    typeof import('@/components/AddressHighlight')
  >('@/components/AddressHighlight')
  return {
    EntityBadge: ({
      children,
      name,
      address,
      variant,
      showAvatar,
    }: {
      children: React.ReactNode
      name?: string
      address?: Address
      variant?: string
      showAvatar?: boolean
    }) => {
      const highlight = useAddressHighlight(address)
      return (
        <button
          type="button"
          data-testid="entity-badge"
          data-name={name}
          data-address-highlighted={highlight.isHighlighted || undefined}
          onPointerEnter={highlight.onPointerEnter}
          onPointerLeave={highlight.onPointerLeave}
        >
          {showAvatar && variant === 'name' && name ? (
            <span data-testid="name-avatar">{name}</span>
          ) : null}
          {children}
        </button>
      )
    },
  }
})

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

  it('shows a child with an unknown label without linking to it', () => {
    const placeholder = `[${'ab'.repeat(32)}].test.eth`
    render(
      <SubnamesTable
        subnames={[
          createMockSubname(placeholder),
          createMockSubname('sub.test.eth'),
        ]}
        name="test.eth"
      />,
    )

    const linkedNames = screen
      .getAllByTestId('entity-badge')
      .map((badge) => badge.getAttribute('data-name'))
    expect(screen.getAllByText(placeholder).length).toBeGreaterThan(0)
    expect(linkedNames).toContain('sub.test.eth')
    expect(linkedNames).not.toContain(placeholder)
  })

  describe('with a label this browser has opened', () => {
    const encoded = encodeLabelhash(labelhash('🔥'))
    const placeholder = `${encoded}.test.eth`

    const renderRow = (rowLabelhash: Hex) => {
      rememberName('🔥.test.eth')
      render(
        <SubnamesTable
          subnames={[
            { ...createMockSubname(placeholder), labelhash: rowLabelhash },
          ]}
          name="test.eth"
        />,
      )
      localStorage.clear()
      return screen
        .getAllByTestId('entity-badge')
        .map((badge) => badge.getAttribute('data-name'))
    }

    it('heals the row whose labelhash it is', () => {
      expect(renderRow(labelhash('🔥'))).toContain('🔥.test.eth')
      expect(screen.queryByText(placeholder)).not.toBeInTheDocument()
    })

    // WEB-1458: a label written literally as `[<hex>]` is served the same way.
    it('keeps a literal-bracket label that spells that labelhash', () => {
      const linkedNames = renderRow(keccak256(toHex(encoded)))
      expect(linkedNames).not.toContain('🔥.test.eth')
      expect(screen.getAllByText(placeholder).length).toBeGreaterThan(0)
    })
  })

  it('renders create button when canCreateSubname is true', () => {
    render(<SubnamesTable subnames={[]} name="test.eth" canCreateSubname />)

    expect(screen.getByText('Create subname')).toBeInTheDocument()
  })

  it('links to the creation form when creation is not paused', () => {
    render(
      <SubnamesTable
        subnames={[]}
        name="test.eth"
        canCreateSubname
        isCreationPaused={false}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'Create subname' }),
    ).toHaveAttribute('href', expect.stringContaining('create-subname'))
  })

  it.each(['hover', 'focus'] as const)(
    'keeps creation inert and explains the temporary pause on %s',
    async (interaction) => {
      render(<SubnamesTable subnames={[]} name="test.eth" canCreateSubname />)

      const button = screen.getByRole('button', { name: 'Create subname' })
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(screen.queryByRole('link', { name: 'Create subname' })).toBeNull()

      const user = userEvent.setup()
      if (interaction === 'hover') await user.hover(button)
      else {
        await user.tab()
        await user.tab()
        expect(button).toHaveFocus()
      }

      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Subname creation temporarily disabled.',
      )
    },
  )

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

describe('SubnamesTable owner highlight', () => {
  // onshow.eth as the ticket saw it: seven subnames under one owner, delegate
  // and gov under another.
  const OWNER: Address = '0xC28d000000000000000000000000000000Abc20D'
  const OTHER: Address = '0xA708000000000000000000000000000000008AAa'
  const OWNED = [
    'admin',
    'art',
    'contract',
    'fire',
    'namechain',
    'team',
    'vault',
  ]
  const subnames = [
    ...OWNED.map((label) => createMockSubname(`${label}.onshow.eth`, OWNER)),
    createMockSubname('delegate.onshow.eth', OTHER),
    createMockSubname('gov.onshow.eth', OTHER),
  ]

  const MOUSE = { pointerType: 'mouse' }

  const ownerBadgeOf = (row: HTMLElement) => {
    const badge = within(row)
      .getAllByTestId('entity-badge')
      .find((el) => el.dataset.name === undefined)
    if (!badge) throw new Error('Row has no owner badge')
    return badge
  }
  const highlightedRows = () =>
    within(screen.getByRole('table'))
      .getAllByRole('row')
      .filter((row) => row.querySelector('[data-address-highlighted]'))
      .map((row) => row.querySelector('[data-name]')?.getAttribute('data-name'))

  it('lights up every row the hovered owner holds, and no other', () => {
    render(<SubnamesTable subnames={subnames} name="onshow.eth" />)
    const row = screen
      .getAllByText('admin.onshow.eth')
      .map((el) => el.closest('tr'))
      .find((el) => el !== null)
    if (!row) throw new Error('No table row for admin.onshow.eth')

    fireEvent.pointerEnter(ownerBadgeOf(row), MOUSE)
    expect(highlightedRows()).toEqual(
      OWNED.map((label) => `${label}.onshow.eth`),
    )

    fireEvent.pointerLeave(ownerBadgeOf(row), MOUSE)
    expect(highlightedRows()).toEqual([])
  })
})
