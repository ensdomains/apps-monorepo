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

// The route's own memo is keyed on the two query results, so counting the merge
// pins that specific contract — a tighter statement than "the page settles",
// and the one that would catch the memo being dropped again (#1115 did exactly
// that) even if some future table no longer looped over it.
let mergeCalls = 0
vi.mock('@/utils/names/mergeNamesData', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/names/mergeNamesData')>()
  return {
    ...actual,
    mergeNamesData: (
      ...args: Parameters<typeof actual.mergeNamesData>
    ): ReturnType<typeof actual.mergeNamesData> => {
      mergeCalls++
      return actual.mergeNamesData(...args)
    },
  }
})

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
  mergeCalls = 0
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

  it('keeps the merged rows stable across a re-render', async () => {
    const counter = renderRoute()

    expect(await screen.findByText('Names (2)')).toBeInTheDocument()

    const afterFirstPaint = mergeCalls
    counter.rerenderSubject()

    expect(mergeCalls).toBe(afterFirstPaint)
  })
})
