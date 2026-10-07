import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import type { DashboardName } from '../dashboardNames'
import { MyNamesList } from './MyNamesList'

const dashboardNamesMock = vi.hoisted(() => ({
  useDashboardNames: vi.fn(),
}))

const eligibilityMock = vi.hoisted(() => ({
  useDashboardMigrationEligibility: vi.fn(),
}))

vi.mock('../useDashboardNames', () => ({
  ...dashboardNamesMock,
  DASHBOARD_PAGE_SIZE: 5,
}))
vi.mock('../useDashboardMigrationEligibility', () => eligibilityMock)
vi.mock('./DashboardPagination', () => ({
  DashboardPagination: () => <div data-testid="dashboard-pagination" />,
}))
vi.mock('./NameRow', () => ({
  NameRow: ({
    cta,
    isSelected,
    label,
    nameRole,
    nameRoles,
    selectable,
    status,
  }: {
    readonly cta?: string | null
    readonly isSelected?: boolean
    readonly label: string
    readonly nameRole?: string | null
    readonly nameRoles?: readonly string[] | null
    readonly selectable?: boolean
    readonly status?: string | null
  }) => (
    <div
      data-cta={cta ?? ''}
      data-role={nameRole ?? ''}
      data-roles={nameRoles?.join(',') ?? ''}
      data-selectable={String(selectable ?? false)}
      data-selected={String(isSelected ?? false)}
      data-status={status ?? ''}
      data-testid="name-row"
    >
      {label}
    </div>
  ),
}))

const makeName = (overrides: Partial<DashboardName> = {}): DashboardName => ({
  key: '0x01',
  name: 'alaska.eth',
  protocol: 'v2',
  expiryDate: 1811808000n,
  servedExpiry: null,
  createdAt: 0n,
  nameRoles: ['owner'],
  isLapsed: false,
  ...overrides,
})

const mockNames = (
  names: readonly DashboardName[],
  state: { readonly isError?: boolean; readonly isGraceError?: boolean } = {},
) =>
  dashboardNamesMock.useDashboardNames.mockReturnValue({
    pageNames: names,
    total: names.length,
    hasAddresses: true,
    isPending: false,
    isPagePending: false,
    isError: state.isError ?? false,
    isGraceError: state.isGraceError ?? false,
  })

const renderList = (
  props: { readonly selectedLabels?: ReadonlySet<string> } = {},
) =>
  render(
    <MyNamesList
      favoriteLabels={new Set()}
      isAuthenticated
      migrationEnabled={false}
      onToggleFavorite={() => undefined}
      sort="name-asc"
      {...props}
    />,
  )

describe('MyNamesList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eligibilityMock.useDashboardMigrationEligibility.mockReturnValue({
      eligibleKeys: new Set(),
      isPending: false,
      isError: false,
    })
    mockNames([
      makeName({
        key: '0x02',
        name: 'fgeorgescu.eth',
        protocol: 'v1',
        expiryDate: 1793442936n,
      }),
      makeName({
        key: '0x03',
        name: 'pokemon.fgeorgescu.eth',
        protocol: 'v1',
        expiryDate: 0n,
      }),
    ])
  })

  it('asks the hook for the page in the chosen order and search', () => {
    render(
      <MyNamesList
        favoriteLabels={new Set()}
        isAuthenticated
        onToggleFavorite={() => undefined}
        searchQuery="ali"
        sort="expiry-desc"
      />,
    )

    expect(dashboardNamesMock.useDashboardNames).toHaveBeenCalledWith({
      sortField: 'expiry',
      sortDir: 'desc',
      search: 'ali',
      page: 1,
    })
  })

  it('shows skeletons while the page is still being read', () => {
    dashboardNamesMock.useDashboardNames.mockReturnValue({
      pageNames: [],
      total: 12,
      hasAddresses: true,
      isPending: false,
      isPagePending: true,
      isError: false,
      isGraceError: false,
    })

    renderList()

    expect(screen.queryByTestId('name-row')).not.toBeInTheDocument()
    expect(screen.queryByText('No names to display')).not.toBeInTheDocument()
  })

  it('renders owned V1 names when migration is disabled', () => {
    renderList()

    expect(screen.queryByText('No names to display')).not.toBeInTheDocument()
    const rows = screen.getAllByTestId('name-row')
    expect(rows.map((row) => row.textContent)).toEqual([
      'fgeorgescu.eth',
      'pokemon.fgeorgescu.eth',
    ])
    expect(rows.every((row) => row.dataset.status === 'ensv1Only')).toBe(true)
    expect(rows.every((row) => row.dataset.cta === 'manageExplorer')).toBe(true)
  })

  it('shows the names while migration eligibility is still loading', () => {
    eligibilityMock.useDashboardMigrationEligibility.mockReturnValue({
      eligibleKeys: new Set(),
      isPending: true,
      isError: false,
    })

    renderList()

    const rows = screen.getAllByTestId('name-row')
    expect(rows.map((row) => row.textContent)).toEqual([
      'fgeorgescu.eth',
      'pokemon.fgeorgescu.eth',
    ])
    expect(rows.every((row) => row.dataset.status === '')).toBe(true)
    expect(rows.every((row) => row.dataset.cta === '')).toBe(true)
  })

  it('marks an eligible V1 name for upgrade', () => {
    eligibilityMock.useDashboardMigrationEligibility.mockReturnValue({
      eligibleKeys: new Set(['0x02']),
      isPending: false,
      isError: false,
    })

    renderList()

    expect(
      screen.getAllByTestId('name-row').map((row) => row.dataset.status),
    ).toEqual(['eligibleUpgrade', 'ensv1Only'])
  })

  it('passes roles through to the name row', () => {
    mockNames([
      makeName({
        key: '0x04',
        name: 'manager-only.eth',
        nameRoles: ['manager'],
      }),
      makeName({
        key: '0x05',
        name: 'wrapped.eth',
        nameRoles: ['owner', 'manager'],
      }),
    ])

    renderList()

    const rows = screen.getAllByTestId('name-row')
    expect(rows.map((row) => row.dataset.roles)).toEqual([
      'manager',
      'owner,manager',
    ])
    expect(rows.every((row) => row.dataset.role === '')).toBe(true)
  })

  it('shows an error when names fail and none are available', () => {
    mockNames([], { isError: true })

    renderList()

    expect(screen.getByText('Error loading names')).toBeInTheDocument()
    expect(screen.queryByText('No names to display')).not.toBeInTheDocument()
  })

  it('shows a partial error when eligibility fails but names are available', () => {
    mockNames([makeName({ name: 'alaska.eth' })])
    eligibilityMock.useDashboardMigrationEligibility.mockReturnValue({
      eligibleKeys: new Set(),
      isPending: false,
      isError: true,
    })

    renderList()

    expect(
      screen.getByText('Some names could not be loaded'),
    ).toBeInTheDocument()
    expect(screen.getByText('alaska.eth')).toBeInTheDocument()
  })

  it('shows a partial error when the names in grace fail to load', () => {
    mockNames([makeName({ name: 'alaska.eth' })], { isGraceError: true })

    renderList()

    expect(
      screen.getByText('Some names could not be loaded'),
    ).toBeInTheDocument()
    expect(screen.getByText('alaska.eth')).toBeInTheDocument()
  })

  it('offers bulk renewal only for names the accounts hold', () => {
    const renewable = BigInt(Math.floor(Date.now() / 1000) + 3 * 86_400)
    mockNames([
      makeName({
        key: '0x0a',
        name: 'lapsed.eth',
        expiryDate: BigInt(Math.floor(Date.now() / 1000) - 86_400),
        nameRoles: [],
        isLapsed: true,
      }),
      makeName({
        key: '0x08',
        name: 'managed.eth',
        expiryDate: renewable,
        nameRoles: ['manager'],
      }),
      makeName({ key: '0x09', name: 'owned.eth', expiryDate: renewable }),
    ])

    renderList()

    const rows = screen.getAllByTestId('name-row')
    expect(
      rows.map((row) => [row.textContent, row.dataset.selectable]),
    ).toEqual([
      ['lapsed.eth', 'true'],
      ['managed.eth', 'false'],
      ['owned.eth', 'true'],
    ])
  })

  it('selects only the name whose exact label is selected', () => {
    mockNames([
      makeName({ key: '0x06', name: 'alice.eth' }),
      makeName({ key: '0x07', name: 'ALICE.eth' }),
    ])

    renderList({ selectedLabels: new Set(['alice.eth']) })

    const rows = screen.getAllByTestId('name-row')
    const byLabel = new Map(rows.map((row) => [row.textContent, row] as const))

    expect(byLabel.get('alice.eth')?.dataset.selected).toBe('true')
    expect(byLabel.get('ALICE.eth')?.dataset.selected).toBe('false')
    expect(byLabel.get('ALICE.eth')?.dataset.selectable).toBe('false')
  })
})
