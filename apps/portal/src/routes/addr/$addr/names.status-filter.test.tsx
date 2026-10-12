import { TransactionManagerProvider } from '@ens-apps/transaction-manager'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { usePublicClient } from 'wagmi'
import { createTestWrapper, renderWithCommitCounter } from '@/test-utils'
import type { V2NameWithRoles } from '@/utils/names/mergeNamesData'

const ADDRESS = '0x55e55c649895940826a852820d9e1a076ec47b09'
const MS_PER_DAY = 24 * 60 * 60 * 1000

// A registered v1 name and a registered v2 name, v1 names that expired 30,
// 100 and 200 days ago, and v2 names that expired 10 and 60 days ago. The
// v1 name from 100 days ago sits 10 days past the 90-day grace, inside the
// 21-day cooldown; the v2 name from 60 days ago is past both its 28-day
// grace and the cooldown window. Expiries stay relative to now because the
// status rule moves with it.
const V1_REGISTERED = 'v1registered.eth'
const V1_GRACE = 'v1grace.eth'
const V1_PREMIUM = 'v1premium.eth'
const V1_EXPIRED = 'v1expired.eth'
const V2_REGISTERED = 'v2registered.eth'
const V2_GRACE = 'v2grace.eth'
const V2_EXPIRED = 'v2expired.eth'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ addr: ADDRESS }),
  }),
}))

// One `useEnsAvatar` per row; the avatars say nothing about the filter and
// their in-flight resolution would add re-renders of its own.
vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: ({ name }: { name: string }) => <span data-name={name} />,
}))

const v1Row = (name: string, expiryMs: number) => ({
  name,
  parentName: 'eth',
  expiryDate: {
    date: new Date(expiryMs),
    value: expiryMs,
  },
  relation: { registrant: true, owner: true, wrappedOwner: false },
})

const V1_NAMES = [
  v1Row(V1_REGISTERED, Date.now() + 365 * MS_PER_DAY),
  v1Row(V1_GRACE, Date.now() - 30 * MS_PER_DAY),
  v1Row(V1_PREMIUM, Date.now() - 100 * MS_PER_DAY),
  v1Row(V1_EXPIRED, Date.now() - 200 * MS_PER_DAY),
]

const v2Row = (name: string, expiryMs: number) => ({
  name,
  expiryDate: Math.floor(expiryMs / 1000),
  roleBitmap: '0x5',
  subdomainCount: 0,
})

const V2_NAMES = [
  v2Row(V2_REGISTERED, Date.now() + 730 * MS_PER_DAY),
  v2Row(V2_GRACE, Date.now() - 10 * MS_PER_DAY),
  v2Row(V2_EXPIRED, Date.now() - 60 * MS_PER_DAY),
] satisfies V2NameWithRoles[]

// One loaded page per source, with a stable identity like the query cache's.
const QUERY_DATA: Record<string, unknown> = {
  ENSv1: {
    pages: [{ names: V1_NAMES, hasNextPage: false }],
    pageParams: [undefined],
  },
  ENSv2: {
    pages: [
      {
        names: V2_NAMES,
        totalCount: V2_NAMES.length,
        nextCursor: undefined,
      },
    ],
    pageParams: [undefined],
  },
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
    useInfiniteQuery: ({
      queryKey,
    }: {
      queryKey: readonly [string, { protocolVersion: string }]
    }) => ({
      data: QUERY_DATA[queryKey[1].protocolVersion],
      isLoading: false,
      error: null,
      isFetchNextPageError: false,
      hasNextPage: false,
      fetchNextPage: () => Promise.resolve(),
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

const openStatusFilter = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /^Status/ }))
  expect(await screen.findByText('Filter by status')).toBeInTheDocument()
}

const shownNames = () =>
  screen
    .getAllByText(/\.eth$/)
    .map((element) => element.textContent)
    .filter((text, index, all) => text !== null && all.indexOf(text) === index)

describe('addr names route status filter', () => {
  it('offers Price cooldown in the Expired group and nowhere says Temporary premium', async () => {
    const user = userEvent.setup()
    renderRoute()

    expect(await screen.findByText('Names (7)')).toBeInTheDocument()
    await openStatusFilter(user)

    const menu = screen
      .getByText('Filter by status')
      .closest('div[class*="p-4"]')
    expect(menu).not.toBeNull()
    const menuText = menu?.textContent ?? ''
    expect(menuText).toContain('Price cooldown')
    expect(menuText).not.toContain('Temporary premium')
    expect(
      menuText.indexOf('Expired') < menuText.indexOf('Grace') &&
        menuText.indexOf('Grace') < menuText.indexOf('Price cooldown'),
    ).toBe(true)

    expect(screen.getByText('Registered')).toBeInTheDocument()
    expect(screen.getByText('Expires with parent')).toBeInTheDocument()
    expect(screen.getByText('Does not expire')).toBeInTheDocument()
  })

  it('narrows the list to the cooldown names when Price cooldown is chosen', async () => {
    const user = userEvent.setup()
    renderRoute()

    expect(await screen.findByText('Names (7)')).toBeInTheDocument()
    await openStatusFilter(user)

    await user.click(screen.getByText('Price cooldown'))
    expect(await screen.findByText('Names (1 of 7 shown)')).toBeInTheDocument()
    expect(shownNames()).toEqual([V1_PREMIUM])

    await user.click(screen.getByText('Price cooldown'))
    expect(await screen.findByText('Names (7)')).toBeInTheDocument()
    expect(shownNames()).toHaveLength(7)

    await user.click(screen.getByText('Expired'))
    expect(await screen.findByText('Names (2 of 7 shown)')).toBeInTheDocument()
    expect(shownNames()).toEqual(
      expect.arrayContaining([V1_EXPIRED, V2_EXPIRED]),
    )
    expect(shownNames()).toHaveLength(2)

    await user.click(screen.getByText('Expired'))
    expect(await screen.findByText('Names (7)')).toBeInTheDocument()
  })
})
