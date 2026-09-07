import { TransactionManagerProvider } from '@ens-apps/transaction-manager'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Profiler, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePublicClient } from 'wagmi'
import { createTestWrapper } from '@/test-utils'
import type { V1Name, V2NameWithRoles } from '@/utils/names/mergeNamesData'

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
// stop exercising the renewable path while still passing. `mergeNamesData`
// sorts ascending by expiry, so the shorter v1 expiry keeps that name at row 0.
const V1_NAMES = [
  {
    name: V1_NAME,
    expiryDate: { date: new Date(Date.now() + 365 * MS_PER_DAY) },
    relation: { registrant: true, owner: true, wrappedOwner: false },
  },
] satisfies V1Name[]

const V2_NAMES = [
  {
    name: V2_NAME,
    expiryDate: Math.floor((Date.now() + 730 * MS_PER_DAY) / 1000),
    roleBitmap: '0x5',
    subdomainCount: 0,
    recordCount: 0,
  },
] satisfies V2NameWithRoles[]

const QUERY_DATA: Record<string, unknown> = {
  'get-names-for-address': V1_NAMES,
  'get-v2-names-with-roles-for-address': V2_NAMES,
}

/** Every query key the route handed to `useQueries`, in request order. */
const requestedQueryKeys: (readonly unknown[])[] = []

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueries: ({
      queries,
    }: {
      queries: readonly { queryKey: readonly unknown[] }[]
    }) =>
      queries.map(({ queryKey }) => {
        requestedQueryKeys.push(queryKey)
        return {
          data: QUERY_DATA[queryKey[0] as string],
          isLoading: false,
          error: null,
        }
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

/**
 * Mount the route under a `Profiler` that counts commits, and expose a way to
 * force another render of it from the outside. The provider tree is built per
 * call so each test gets the fresh QueryClient `createTestWrapper` promises.
 */
const renderRoute = () => {
  const TestProviders = createTestWrapper()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders>
      <TransactionManagerScope>{children}</TransactionManagerScope>
    </TestProviders>
  )

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
  const { rerender } = render(tree(), { wrapper })
  return {
    commitCount: () => commits,
    rerenderRoute: () => rerender(tree()),
  }
}

/** A fixed window in which a running render loop would show itself. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

/**
 * `commits` only ever moves when the `Profiler` reports, so a Profiler that
 * stopped firing — a wrapper refactor, a build where `onRender` is a no-op —
 * would leave it at 0 and sail through both halves of the oracle below. Each
 * test structurally commits at least twice: the mount, and the render that arms
 * the loop.
 */
const MIN_SETTLED_COMMITS = 2

/**
 * Upper bounds on the first window, one per test so their legitimate render
 * costs can drift apart — the selection case carries the pointer sequence and
 * the header's swap to the selected-count bar. Both measure exactly 7 settled
 * commits today, stable across runs: the mount, plus the render that arms the
 * loop. At `2c50ab71` the same windows measured 19-33 (mount) and 54-71
 * (selection), so 14 sits clear of both.
 */
const MAX_SETTLED_COMMITS = { onMount: 14, afterSelection: 14 }

/**
 * The oracle: after one quiet window the route has committed only its mount
 * renders, and a second quiet window adds none at all. A route stuck in the
 * WEB-1411 loop fails both halves — it blows the bound and keeps climbing.
 */
const expectSettled = async (
  commitCount: () => number,
  maxSettledCommits: number,
) => {
  await settle()
  const settledCommits = commitCount()
  expect(settledCommits).toBeGreaterThanOrEqual(MIN_SETTLED_COMMITS)
  expect(settledCommits).toBeLessThan(maxSettledCommits)
  await settle()
  expect(commitCount()).toBe(settledCommits)
}

beforeEach(() => {
  requestedQueryKeys.length = 0
})

describe('addr names route', () => {
  it('stops re-rendering once the names are shown', async () => {
    const { commitCount, rerenderRoute } = renderRoute()

    expect(await screen.findByText('Names (2)')).toBeInTheDocument()
    // Once in the mobile card list, once in the desktop table.
    expect(screen.getAllByText(V1_NAME)).toHaveLength(2)

    // TanStack Table's `_autoResetPageIndex` only registers itself on its first
    // call, so the loop cannot start until the route has rendered a second time
    // with a fresh `data` array. Drive that render rather than leaning on
    // whatever incidental churn the providers happen to produce, otherwise this
    // test could go green against the unfixed route for the wrong reason.
    rerenderRoute()

    await expectSettled(commitCount, MAX_SETTLED_COMMITS.onMount)
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

    // ...and it is what switches on `useRenewableNames` / `useV1Renewable`.
    // Assert the route actually asked for the selected v1 name's on-chain
    // renewability, so the extra coverage this test claims is real.
    expect(requestedQueryKeys).toContainEqual([
      'is-renewable',
      expect.objectContaining({ name: V1_NAME }),
    ])

    await expectSettled(commitCount, MAX_SETTLED_COMMITS.afterSelection)
  })
})
