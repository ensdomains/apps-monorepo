import { TransactionManagerProvider } from '@ens-apps/transaction-manager'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePublicClient } from 'wagmi'
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
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
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
// stop exercising the renewable path while still passing. bigname sorts by
// expiry ascending, so the shorter v1 expiry keeps that name at row 0.
const NAMES: AddressNameItem[] = [
  {
    name: V1_NAME,
    expiryDate: new Date(Date.now() + 365 * MS_PER_DAY),
    graceEndDate: new Date(Date.now() + 455 * MS_PER_DAY),
    hasNameRow: true,
    protocolVersion: 'ENSv1',
    roleBitmap: null,
    v1Roles: { owner: true, manager: true },
    relations: ['owner', 'manager'],
  },
  {
    name: V2_NAME,
    expiryDate: new Date(Date.now() + 730 * MS_PER_DAY),
    graceEndDate: new Date(Date.now() + 758 * MS_PER_DAY),
    hasNameRow: true,
    protocolVersion: 'ENSv2',
    subdomainCount: 0,
    recordCount: 0,
    roleBitmap: '0x5',
    v1Roles: null,
    relations: ['owner', 'manager'],
  },
]

/** Every query key the route handed to `useQueries`, in request order. */
const requestedQueryKeys: (readonly unknown[])[] = []

// The names list comes from one `useQuery`; every other `useQuery` in the tree
// runs for real. The same `NAMES` array is returned on every render, as the
// query cache would.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      const isNames = options.queryKey[0] === 'get-address-names'
      // Always call the real hook, so hook order never depends on the key;
      // the names query is kept from fetching and answered from `NAMES`.
      const result = actual.useQuery({
        ...(options as Parameters<typeof actual.useQuery>[0]),
        ...(isNames ? { enabled: false } : {}),
      })
      return isNames ? { data: NAMES, isLoading: false, error: null } : result
    },
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
})
