import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import type { DashboardName } from '../dashboardNames'
import { MyNamesList } from './MyNamesList'

const dashboardNamesMock = vi.hoisted(() => ({
  useDashboardNames: vi.fn(),
}))

const migrationEligibilityMock = vi.hoisted(() => ({
  useDashboardMigrationEligibility: vi.fn(),
}))

vi.mock('../useDashboardNames', () => dashboardNamesMock)
vi.mock('../useDashboardMigrationEligibility', () => migrationEligibilityMock)
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

const makeName = (
  overrides: Partial<DashboardName> & Pick<DashboardName, 'name'>,
): DashboardName => ({
  key: `0x${overrides.name}`,
  protocol: 'v2',
  expiryDate: 1811808000,
  createdAt: null,
  nameRoles: ['owner'],
  ...overrides,
})

const mockNames = (
  names: readonly DashboardName[],
  state: { readonly isPending?: boolean; readonly isError?: boolean } = {},
) =>
  dashboardNamesMock.useDashboardNames.mockReturnValue({
    names,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
  })

const mockEligibility = (
  eligibleNames: readonly string[] = [],
  state: { readonly isPending?: boolean; readonly isError?: boolean } = {},
) =>
  migrationEligibilityMock.useDashboardMigrationEligibility.mockReturnValue({
    eligibleNames: new Set(eligibleNames),
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
  })

const renderList = (props: Partial<Parameters<typeof MyNamesList>[0]> = {}) =>
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
    mockNames([
      makeName({
        name: 'fgeorgescu.eth',
        protocol: 'v1',
        expiryDate: 1793442936,
      }),
      makeName({
        name: 'pokemon.fgeorgescu.eth',
        protocol: 'v1',
        expiryDate: 0,
      }),
    ])
    mockEligibility()
  })

  it('renders owned V1 names when migration is disabled', () => {
    renderList()

    expect(screen.getByText('fgeorgescu.eth')).toBeInTheDocument()
    expect(screen.getByText('pokemon.fgeorgescu.eth')).toBeInTheDocument()
    expect(screen.queryByText('No names to display')).not.toBeInTheDocument()

    const rows = screen.getAllByTestId('name-row')
    expect(rows.map((row) => row.textContent)).toEqual([
      'fgeorgescu.eth',
      'pokemon.fgeorgescu.eth',
    ])
    expect(rows.every((row) => row.dataset.status === 'ensv1Only')).toBe(true)
    expect(rows.every((row) => row.dataset.cta === 'manageExplorer')).toBe(true)
  })

  it('labels an eligible V1 name for upgrade', () => {
    mockEligibility(['fgeorgescu.eth'])

    renderList({ migrationEnabled: true })

    const rows = screen.getAllByTestId('name-row')
    expect(rows.map((row) => row.dataset.status)).toEqual([
      'eligibleUpgrade',
      'ensv1Only',
    ])
  })

  it('passes V1 and V2 roles through to the name row', () => {
    mockNames([
      makeName({
        name: 'manager-only.eth',
        protocol: 'v1',
        nameRoles: ['manager'],
      }),
      makeName({
        name: 'wrapped.eth',
        protocol: 'v1',
        nameRoles: ['owner', 'manager'],
      }),
      makeName({ name: 'zeta.eth', nameRoles: ['owner', 'manager'] }),
    ])

    renderList()

    const rows = screen.getAllByTestId('name-row')
    expect(rows.map((row) => row.dataset.roles)).toEqual([
      'manager',
      'owner,manager',
      'owner,manager',
    ])
    expect(rows.every((row) => row.dataset.role === '')).toBe(true)
  })

  it('filters by substring and sorts by the chosen field', () => {
    mockNames([
      makeName({ name: 'alpha.eth', expiryDate: 1_900_000_000 }),
      makeName({ name: 'beta-alp.eth', expiryDate: 1_850_000_000 }),
      makeName({ name: 'gamma.eth', expiryDate: 1_800_000_000 }),
    ])

    renderList({ searchQuery: 'alp', sort: 'expiry-asc' })

    expect(
      screen.getAllByTestId('name-row').map((row) => row.textContent),
    ).toEqual(['beta-alp.eth', 'alpha.eth'])
  })

  it('shows an error when names fail and none are available', () => {
    mockNames([], { isError: true })

    renderList()

    expect(screen.getByText('Error loading names')).toBeInTheDocument()
    expect(screen.queryByText('No names to display')).not.toBeInTheDocument()
  })

  it('shows a partial error when eligibility fails but names are available', () => {
    mockNames([makeName({ name: 'alaska.eth' })])
    mockEligibility([], { isError: true })

    renderList({ migrationEnabled: true })

    expect(
      screen.getByText('Some names could not be loaded'),
    ).toBeInTheDocument()
    expect(screen.getByText('alaska.eth')).toBeInTheDocument()
  })

  it('selects only the name whose exact label is selected', () => {
    mockNames([
      makeName({ name: 'alice.eth' }),
      makeName({ name: 'alice2.eth' }),
    ])

    renderList({ selectedLabels: new Set(['alice.eth']) })

    const rows = screen.getAllByTestId('name-row')
    const byLabel = new Map(rows.map((row) => [row.textContent, row] as const))

    expect(byLabel.get('alice.eth')?.dataset.selected).toBe('true')
    expect(byLabel.get('alice2.eth')?.dataset.selected).toBe('false')
  })
})
