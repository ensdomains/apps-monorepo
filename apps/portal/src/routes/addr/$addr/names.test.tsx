import { TransactionManagerProvider } from '@ens-apps/transaction-manager'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Profiler, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { usePublicClient } from 'wagmi'
import { createTestWrapper } from '@/test-utils'

const ADDRESS = '0x55e55c649895940826a852820d9e1a076ec47b09'

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

// Sorted by expiry, so the v1 name is row 0 — selecting it is what switches on
// the `useRenewableNames` / `useV1Renewable` path.
const V1_NAMES = [
  {
    name: 'sugh004.eth',
    expiryDate: { date: new Date('2027-02-11T00:00:00Z') },
    relation: { registrant: true, owner: true, wrappedOwner: false },
  },
]
const V2_NAMES = [
  {
    name: 'ensv2sg2.eth',
    expiryDate: 1817000000,
    roleBitmap: '0x5',
    subdomainCount: 0,
    recordCount: 0,
  },
]

const QUERY_DATA: Record<string, unknown> = {
  'get-names-for-address': V1_NAMES,
  'get-v2-names-with-roles-for-address': V2_NAMES,
}

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueries: ({
      queries,
    }: {
      queries: readonly { queryKey: readonly unknown[] }[]
    }) =>
      queries.map(({ queryKey }) => ({
        data: QUERY_DATA[queryKey[0] as string],
        isLoading: false,
        error: null,
      })),
  }
})

// `createFileRoute` is mocked to hand back the options object, so `Route` is
// that object and `Route.component` is the page. See ../../$name/fuses tests.
const { Route } = await import('./names')
const NamesRoute = (Route as unknown as { component: () => ReactNode })
  .component

/** Mirrors `__root.tsx`: the route reads the transaction manager's context. */
const TestProviders = createTestWrapper()
const TransactionManagerScope = ({ children }: { children: ReactNode }) => {
  const publicClient = usePublicClient()
  if (!publicClient) return <>{children}</>
  return (
    <TransactionManagerProvider publicClient={publicClient}>
      {children}
    </TransactionManagerProvider>
  )
}

const Wrapper = ({ children }: { children: ReactNode }) => (
  <TestProviders>
    <TransactionManagerScope>{children}</TransactionManagerScope>
  </TestProviders>
)

/**
 * Mount the route under a `Profiler` that counts commits, and expose a way to
 * force another render of it from the outside.
 */
const renderRoute = () => {
  let commits = 0
  const tree = () => (
    <Profiler
      id="names-route"
      onRender={() => {
        commits += 1
      }}
    >
      <NamesRoute />
    </Profiler>
  )
  const { rerender } = render(tree(), { wrapper: Wrapper })
  return {
    commitCount: () => commits,
    rerenderRoute: () => rerender(tree()),
  }
}

/** A fixed window in which a running render loop would show itself. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

/**
 * A settled route commits only its mount renders — measured at exactly 7 here,
 * unchanged across runs. At `2c50ab71` the loop pushed the same window to 21-33,
 * and to 52-77 once a click moves the updates onto React's sync lane. 14 leaves
 * headroom over the settled cost while staying well under the looping rate.
 */
const MAX_SETTLED_COMMITS = 14

/**
 * The oracle: after one quiet window the route has committed only its mount
 * renders, and a second quiet window adds none at all. A route stuck in the
 * WEB-1411 loop fails both halves — it blows the bound and keeps climbing.
 */
const expectSettled = async (commitCount: () => number) => {
  await settle()
  const settledCommits = commitCount()
  expect(settledCommits).toBeLessThan(MAX_SETTLED_COMMITS)
  await settle()
  expect(commitCount()).toBe(settledCommits)
}

describe('addr names route', () => {
  it('stops re-rendering once the names are shown', async () => {
    const { commitCount, rerenderRoute } = renderRoute()

    expect(await screen.findByText('Names (2)')).toBeInTheDocument()
    // Once in the mobile card list, once in the desktop table.
    expect(screen.getAllByText('sugh004.eth')).toHaveLength(2)

    // TanStack Table's `_autoResetPageIndex` only registers itself on its first
    // call, so the loop cannot start until the route has rendered a second time
    // with a fresh `data` array. Drive that render rather than leaning on
    // whatever incidental churn the providers happen to produce, otherwise this
    // test could go green against the unfixed route for the wrong reason.
    rerenderRoute()

    await expectSettled(commitCount)
  })

  it('stops re-rendering after a row is selected', async () => {
    const user = userEvent.setup()
    const { commitCount } = renderRoute()

    expect(await screen.findByText('Names (2)')).toBeInTheDocument()

    // The reported symptom is a freeze on interaction, and a real click is also
    // what puts these updates on React's sync lane. Selecting row 0 doubles as
    // the second render the loop needs to arm itself.
    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0])
    expect(await screen.findByText('1 selected')).toBeInTheDocument()

    await expectSettled(commitCount)
  })
})
