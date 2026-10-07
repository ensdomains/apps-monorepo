import type { DomainFragment } from '@ens-apps/indexer'
import { fireEvent, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { render } from '@/utils/test-utils'
import { MyNamesList } from './MyNamesList'

const ownedDomainsMock = vi.hoisted(() => ({
  useOwnedDomains: vi.fn(),
}))

const dashboardV1NamesMock = vi.hoisted(() => ({
  useDashboardV1Names: vi.fn(),
}))

vi.mock('./nameRowRecordsQuery', () => ({
  nameRowRecordsQuery: (name: string) => ({
    queryKey: ['row-records', name],
    queryFn: async () => ({ texts: [] }),
  }),
}))
vi.mock('../useOwnedDomains', () => ownedDomainsMock)
vi.mock('../useDashboardV1Names', () => dashboardV1NamesMock)
vi.mock('./ChoosePrimaryNameDialog', () => ({
  ChoosePrimaryNameDialog: ({ open }: { readonly open?: boolean }) =>
    open ? <div aria-label="Choose Primary Name" role="dialog" /> : null,
}))
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
    primaryNameAction,
    selectable,
    status,
  }: {
    readonly cta?: string | null
    readonly isSelected?: boolean
    readonly label: string
    readonly nameRole?: string | null
    readonly nameRoles?: readonly string[] | null
    readonly primaryNameAction?: ReactNode
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
      {primaryNameAction}
    </div>
  ),
}))

const makeV1Domain = (overrides: Partial<V1Domain> = {}): V1Domain => ({
  id: overrides.id ?? '0x1',
  labelName: overrides.labelName ?? 'fgeorgescu',
  labelhash: overrides.labelhash ?? '0xlabel',
  name: overrides.name ?? 'fgeorgescu.eth',
  resolver: overrides.resolver ?? null,
  owner: overrides.owner ?? { id: '0xowner' },
  registrant: overrides.registrant ?? null,
  wrappedOwner: overrides.wrappedOwner ?? null,
  parent: overrides.parent ?? null,
  registration: overrides.registration ?? null,
  wrappedDomain: overrides.wrappedDomain ?? null,
})

const makeV2Domain = (
  overrides: Partial<DomainFragment> & {
    readonly nameRoles?: readonly string[]
  } = {},
) =>
  ({
    __typename: 'Domain',
    id: overrides.id ?? '0xv2',
    name: overrides.name ?? 'alaska.eth',
    normalizedName: overrides.normalizedName ?? overrides.name ?? 'alaska.eth',
    tokenId: overrides.tokenId ?? null,
    createdAt: overrides.createdAt ?? 0,
    registrationDate: null,
    expiryDate: overrides.expiryDate ?? 1811808000,
    owner: overrides.owner ?? {
      __typename: 'Account',
      id: '0xowner',
    },
    resolver: overrides.resolver ?? null,
    nameRoles: overrides.nameRoles,
  }) as DomainFragment & { readonly nameRoles?: readonly string[] }

describe('MyNamesList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ownedDomainsMock.useOwnedDomains.mockReturnValue({
      v2Names: [],
      isPending: false,
      isError: false,
    })
    dashboardV1NamesMock.useDashboardV1Names.mockReturnValue({
      v1Names: [
        makeV1Domain({
          id: '0xfgeorgescu',
          labelName: 'fgeorgescu',
          name: 'fgeorgescu.eth',
          registration: { expiryDate: '1793442936' },
          wrappedDomain: { expiryDate: '1801218936', fuses: 196608 },
        }),
        makeV1Domain({
          id: '0xpokemon',
          labelName: 'pokemon',
          name: 'pokemon.fgeorgescu.eth',
          wrappedDomain: { expiryDate: '0', fuses: 0 },
        }),
      ].map((domain) => ({
        domain,
        label: domain.labelName ?? domain.name,
        isMigrationEligible: false,
      })),
      isPending: false,
      isError: false,
    })
  })

  it('offers only the primary row action and keeps its chooser open when the primary row changes', () => {
    dashboardV1NamesMock.useDashboardV1Names.mockReturnValue({
      v1Names: [],
      isPending: false,
      isError: false,
    })
    ownedDomainsMock.useOwnedDomains.mockReturnValue({
      v2Names: [
        makeV2Domain({ id: 'a', name: 'alpha.eth' }),
        makeV2Domain({ id: 'b', name: 'beta.eth' }),
      ],
      isPending: false,
      isError: false,
    })
    const surface = (primaryName: string) => (
      <MyNamesList
        favoriteLabels={new Set()}
        isAuthenticated
        migrationEnabled={false}
        onToggleFavorite={() => undefined}
        primaryLabel={primaryName}
        sort="name-asc"
      />
    )
    const { rerender } = render(surface('alpha.eth'))
    const action = screen.getByRole('button', { name: 'Primary Name' })
    expect(action.closest('[data-testid="name-row"]')).toHaveTextContent(
      'alpha.eth',
    )
    fireEvent.click(action)
    expect(
      screen.getByRole('dialog', { name: 'Choose Primary Name' }),
    ).toBeInTheDocument()
    rerender(surface('beta.eth'))
    expect(
      screen.getByRole('dialog', { name: 'Choose Primary Name' }),
    ).toBeInTheDocument()
    expect(
      screen
        .getByRole('button', { name: 'Primary Name' })
        .closest('[data-testid="name-row"]'),
    ).toHaveTextContent('beta.eth')
  })

  it('renders owned V1 names when migration is disabled', () => {
    render(
      <MyNamesList
        favoriteLabels={new Set()}
        isAuthenticated
        migrationEnabled={false}
        onToggleFavorite={() => undefined}
        sort="name-asc"
      />,
    )

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

  it('passes V1 manager roles through to the name row', () => {
    dashboardV1NamesMock.useDashboardV1Names.mockReturnValue({
      v1Names: [
        {
          domain: makeV1Domain({
            id: '0xmanager',
            labelName: 'manager-only',
            name: 'manager-only.eth',
          }),
          label: 'manager-only',
          isMigrationEligible: false,
          nameRoles: ['manager'],
        },
        {
          domain: makeV1Domain({
            id: '0xboth',
            labelName: 'wrapped',
            name: 'wrapped.eth',
          }),
          label: 'wrapped',
          isMigrationEligible: false,
          nameRoles: ['owner', 'manager'],
        },
      ],
      isPending: false,
      isError: false,
    })

    render(
      <MyNamesList
        favoriteLabels={new Set()}
        isAuthenticated
        migrationEnabled={false}
        onToggleFavorite={() => undefined}
        sort="name-asc"
      />,
    )

    const rows = screen.getAllByTestId('name-row')
    expect(rows.map((row) => row.dataset.roles)).toEqual([
      'manager',
      'owner,manager',
    ])
    expect(rows.every((row) => row.dataset.role === '')).toBe(true)
  })

  it('passes V2 manager roles through to the name row', () => {
    ownedDomainsMock.useOwnedDomains.mockReturnValue({
      v2Names: [
        makeV2Domain({
          id: '0xalaska',
          name: 'alaska.eth',
          nameRoles: ['owner', 'manager'],
        }),
      ],
      isPending: false,
      isError: false,
    })
    dashboardV1NamesMock.useDashboardV1Names.mockReturnValue({
      v1Names: [],
      isPending: false,
      isError: false,
    })

    render(
      <MyNamesList
        favoriteLabels={new Set()}
        isAuthenticated
        onToggleFavorite={() => undefined}
        sort="name-asc"
      />,
    )

    const row = screen.getByTestId('name-row')
    expect(row).toHaveTextContent('alaska.eth')
    expect(row.dataset.roles).toBe('owner,manager')
  })

  it('shows an error when V1 names fail and no other names are available', () => {
    dashboardV1NamesMock.useDashboardV1Names.mockReturnValue({
      v1Names: [],
      isPending: false,
      isError: true,
    })

    render(
      <MyNamesList
        favoriteLabels={new Set()}
        isAuthenticated
        migrationEnabled={false}
        onToggleFavorite={() => undefined}
        sort="name-asc"
      />,
    )

    expect(screen.getByText('Error loading names')).toBeInTheDocument()
    expect(screen.queryByText('No names to display')).not.toBeInTheDocument()
  })

  it('shows a partial error when V1 names fail but V2 names are available', () => {
    ownedDomainsMock.useOwnedDomains.mockReturnValue({
      v2Names: [makeV2Domain({ id: '0xalaska', name: 'alaska.eth' })],
      isPending: false,
      isError: false,
    })
    dashboardV1NamesMock.useDashboardV1Names.mockReturnValue({
      v1Names: [],
      isPending: false,
      isError: true,
    })

    render(
      <MyNamesList
        favoriteLabels={new Set()}
        isAuthenticated
        migrationEnabled={false}
        onToggleFavorite={() => undefined}
        sort="name-asc"
      />,
    )

    expect(
      screen.getByText('Some names could not be loaded'),
    ).toBeInTheDocument()
    expect(screen.getByText('alaska.eth')).toBeInTheDocument()
  })

  it('hides an un-normalised look-alike and selects only the canonical name', () => {
    ownedDomainsMock.useOwnedDomains.mockReturnValue({
      v2Names: [
        makeV2Domain({ id: '0xalice', name: 'alice.eth' }),
        makeV2Domain({
          id: '0xalice-lookalike',
          name: 'ALICE.eth',
          normalizedName: 'alice.eth',
        }),
      ],
      isPending: false,
      isError: false,
    })
    dashboardV1NamesMock.useDashboardV1Names.mockReturnValue({
      v1Names: [],
      isPending: false,
      isError: false,
    })

    render(
      <MyNamesList
        favoriteLabels={new Set()}
        isAuthenticated
        migrationEnabled={false}
        onToggleFavorite={() => undefined}
        selectedLabels={new Set(['alice.eth'])}
        sort="name-asc"
      />,
    )

    const rows = screen.getAllByTestId('name-row')

    expect(rows.map((row) => row.textContent)).toEqual(['alice.eth'])
    expect(rows[0]?.dataset.selected).toBe('true')
  })
})
