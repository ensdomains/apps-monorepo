import { TransactionManagerProvider } from '@ens-apps/transaction-manager'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePublicClient } from 'wagmi'
import type { RegistryRole } from '@/lib/roles/registryPowerRoles'
import {
  createTestWrapper,
  expectSettled,
  renderWithCommitCounter,
} from '@/test-utils'
import type { AddressNameItem } from '@/utils/names/addressNames'

const ADDRESS = '0x55e55c649895940826a852820d9e1a076ec47b09'
const V1_NAME = 'sugh004.eth'
const V2_NAME = 'ensv2sg2.eth'
const MS_PER_DAY = 24 * 60 * 60 * 1000

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode
    to: string
    params?: { name?: string }
  }) => <a href={params?.name ? `/${params.name}` : to}>{children}</a>,
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ addr: ADDRESS }),
  }),
}))

// One `useEnsAvatar` per row; the avatars say nothing about the table's render
// behaviour and their in-flight resolution would add re-renders of its own.
vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: ({ name }: { name: string }) => <span data-name={name} />,
}))

// Expiries are relative to now, because the route reads them through windows
// that move: `getNameStatus` and, for the selection test, `isExtendable2LD`'s
// 90-day v1 grace — a fixed date would eventually fall outside it and quietly
// stop exercising the renewable path while still passing. The read sorts
// ascending by expiry, so the shorter v1 expiry keeps that name at row 0.
const BASE_NAMES: AddressNameItem[] = [
  {
    name: V1_NAME,
    expiryDate: new Date(Date.now() + 365 * MS_PER_DAY),
    graceEndDate: null,
    status: 'active',
    relations: ['owner', 'manager'],
    protocolVersion: 'ENSv1',
  },
  {
    name: V2_NAME,
    expiryDate: new Date(Date.now() + 730 * MS_PER_DAY),
    graceEndDate: null,
    status: 'active',
    relations: ['owner'],
    protocolVersion: 'ENSv2',
  },
]

let NAMES = BASE_NAMES

const ADDRESS_ROLES: ReadonlyMap<string, readonly RegistryRole[]> = new Map([
  [V2_NAME, ['ROLE_RENEW', 'ROLE_SET_RESOLVER_ADMIN']],
])

// Cached and fresh, so the route renders the names without a request.
vi.mock('@/features/dashboard/hooks/useAddressNames', () => ({
  getAddressNamesQueryKey: (params: unknown) => ['get-address-names', params],
  getAddressNamesQueryOptions: (params: unknown) => ({
    queryKey: ['get-address-names', params],
    queryFn: () => NAMES,
    initialData: NAMES,
    staleTime: Number.POSITIVE_INFINITY,
  }),
}))

vi.mock(
  '@/features/dashboard/hooks/useAddressRoleCounts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/dashboard/hooks/useAddressRoleCounts')
    >()),
    getAddressRolesQueryOptions: (params: unknown) => ({
      queryKey: ['get-address-roles', params],
      queryFn: () => ADDRESS_ROLES,
      initialData: ADDRESS_ROLES,
      staleTime: Number.POSITIVE_INFINITY,
    }),
  }),
)

/** Every query key the route handed to `useQueries`, in request order. */
const requestedQueryKeys: (readonly unknown[])[] = []

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    // The names read hands back one stable array, as the cache does.
    useQueries: ({
      queries,
    }: {
      queries: readonly { queryKey: readonly unknown[] }[]
    }) =>
      queries.map(({ queryKey }) => {
        requestedQueryKeys.push(queryKey)
        return { data: undefined, isLoading: false, error: null }
      }),
  }
})

// `createFileRoute` is mocked to hand back the options object, so `Route` is
// that object and `Route.component` is the page. See ../../$name/fuses tests.
const { Route } = await import('./names')
const NamesRoute = (Route as unknown as { component: () => ReactNode })
  .component

/** Mirrors `__root.tsx`: the route reads the transaction manager's context. */
const TransactionManagerScope = ({ children }: { children: ReactNode }) => {
  const publicClient = usePublicClient()
  if (!publicClient) return <>{children}</>
  return (
    <TransactionManagerProvider publicClient={publicClient}>
      {children}
    </TransactionManagerProvider>
  )
}

/** The provider tree is built per call so each test gets a fresh QueryClient. */
const renderRoute = () => {
  const TestProviders = createTestWrapper()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders>
      <TransactionManagerScope>{children}</TransactionManagerScope>
    </TestProviders>
  )

  return renderWithCommitCounter(() => <NamesRoute />, { wrapper })
}

/**
 * Upper bounds on the first window, one per test so their legitimate render
 * costs can drift apart — the selection case carries the pointer sequence and
 * the header's swap to the selected-count bar. Both measure 7 settled commits
 * today, stable across runs. Without the route's memo the same windows measure
 * 19-33 (mount) and 54-71 (selection), so 14 sits clear of both.
 */
const MAX_SETTLED_COMMITS = { onMount: 14, afterSelection: 14 }

beforeEach(() => {
  NAMES = BASE_NAMES
  requestedQueryKeys.length = 0
})

describe('addr names route', () => {
  it('stops re-rendering once the names are shown', async () => {
    const counter = renderRoute()

    expect(await screen.findByText('Names (2)')).toBeInTheDocument()
    // Once in the mobile card list, once in the desktop table.
    expect(screen.getAllByText(V1_NAME)).toHaveLength(2)

    counter.rerenderSubject()

    await expectSettled(counter, MAX_SETTLED_COMMITS.onMount)
  })

  it('stops re-rendering after a row is selected', async () => {
    const user = userEvent.setup()
    const counter = renderRoute()

    expect(await screen.findByText('Names (2)')).toBeInTheDocument()

    // The reported symptom is a freeze on interaction, and a real click is also
    // what puts these updates on React's sync lane. Selecting row 0 doubles as
    // the second render the loop needs to arm itself.
    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0])
    expect(await screen.findByText('1 selected')).toBeInTheDocument()

    // ...and it is what switches on `useRenewableNames` / `useV1Renewable`.
    // Assert the route actually asked for the selected v1 name's on-chain
    // renewability, so the extra coverage this test claims is real.
    expect(requestedQueryKeys).toContainEqual([
      'is-renewable',
      expect.objectContaining({ name: V1_NAME }),
    ])

    await expectSettled(counter, MAX_SETTLED_COMMITS.afterSelection)
  })

  it('selects only extendable 2LDs through Select all on desktop and mobile', async () => {
    const user = userEvent.setup()
    NAMES = [
      ...BASE_NAMES.map((row) => ({
        ...row,
        graceEndDate: new Date(Date.now() + MS_PER_DAY),
      })),
      { ...BASE_NAMES[0], name: 'sub.parent.eth' },
      {
        ...BASE_NAMES[0],
        name: 'wrapped.parent.eth',
        expiryDate: new Date(Date.now() + MS_PER_DAY),
      },
      {
        ...BASE_NAMES[1],
        name: 'expired.eth',
        graceEndDate: new Date(Date.now() - MS_PER_DAY),
      },
    ]
    renderRoute()

    expect(await screen.findByText('Names (5)')).toBeInTheDocument()
    expect(screen.getAllByText('sub.parent.eth')).toHaveLength(2)
    expect(screen.getAllByText('wrapped.parent.eth')).toHaveLength(2)
    // One checkbox per eligible name in each layout. Ineligible rows have none.
    expect(
      screen.getAllByRole('checkbox', { name: 'Select row' }),
    ).toHaveLength(4)
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(await screen.findByText('2 selected')).toBeInTheDocument()
    expect(
      screen.getAllByRole('checkbox', { name: 'Select row', checked: true }),
    ).toHaveLength(4)
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
  })

  it('combines level and V1 relationship filters and restores names on reset', async () => {
    const user = userEvent.setup()
    NAMES = [
      ...BASE_NAMES,
      { ...BASE_NAMES[0], name: 'sub.parent.eth', relations: ['manager'] },
      { ...BASE_NAMES[0], name: 'owner.eth', relations: ['owner'] },
    ]
    renderRoute()
    expect(await screen.findByText('Names (4)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    await user.click(screen.getByText('Level', { selector: 'summary' }))
    await user.click(screen.getByText('Subnames (3LD+)'))
    await user.keyboard('{Escape}')
    expect(await screen.findByText('Names (1 of 4 shown)')).toBeInTheDocument()
    expect(screen.getAllByText('sub.parent.eth')).toHaveLength(2)
    expect(screen.queryByText(V1_NAME)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    await user.click(screen.getByText('Roles', { selector: 'summary' }))
    await user.click(screen.getByText('Owner', { selector: 'label' }))
    expect(await screen.findByText('Names (0 of 4 shown)')).toBeInTheDocument()
    await user.click(screen.getByText('Manager', { selector: 'label' }))
    expect(await screen.findByText('Names (1 of 4 shown)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close filters' }))
    expect(
      screen.getByRole('button', { name: 'Remove level filter' }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Remove roles filter' }),
    )
    expect(await screen.findByText('Names (1 of 4 shown)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(await screen.findByText('Names (4)')).toBeInTheDocument()
    expect(screen.getAllByText(V2_NAME)).toHaveLength(2)
  })

  it('uses compact name display in both table layouts', async () => {
    const name = `[${'ab'.repeat(32)}].parent.eth`
    NAMES = [{ ...BASE_NAMES[0], name }]
    renderRoute()
    expect(await screen.findByText('Names (1)')).toBeInTheDocument()
    expect(screen.getAllByText('[abab…abab].parent.eth')).toHaveLength(2)
  })

  it('combines V1 relationships and searchable V2 roles in one Roles filter', async () => {
    const user = userEvent.setup()
    renderRoute()
    expect(await screen.findByText('Names (2)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(screen.getByText('Roles', { selector: 'summary' }))
    await user.click(screen.getByLabelText('Renew'))
    expect(await screen.findByText('Names (1 of 2 shown)')).toBeInTheDocument()
    expect(screen.getAllByText(V2_NAME)).toHaveLength(2)
    expect(screen.queryByText(V1_NAME)).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Owner'))
    expect(await screen.findByText('Names (2 of 2 shown)')).toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: 'Search roles' }),
      'resolver',
    )
    expect(screen.queryByLabelText('Owner')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Set Resolver (admin)'))
    await user.click(screen.getByRole('button', { name: 'Close filters' }))
    expect(
      screen.getByRole('button', { name: 'Remove roles filter' }),
    ).toHaveTextContent('Set Resolver (admin)')
    await user.click(
      screen.getByRole('button', { name: 'Remove roles filter' }),
    )
    expect(await screen.findByText('Names (2)')).toBeInTheDocument()
  })
})
