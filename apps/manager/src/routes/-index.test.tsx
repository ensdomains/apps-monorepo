import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnectionCookie } from '@/lib/connection-cookie'
import { Route } from './index'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  redirect: (options: unknown) => ({ redirect: options }),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/lib/connection-cookie', () => ({ getConnectionCookie: vi.fn() }))
const { bignameFetch } = vi.hoisted(() => ({
  bignameFetch: vi.fn<typeof fetch>(),
}))
vi.mock('@/lib/bigname', async () => {
  const { createBignameClient } = await import('@ens-apps/indexer/bigname')
  return {
    bigname: createBignameClient('https://bigname.test', {
      fetch: (input, init) => bignameFetch(input, init),
    }),
  }
})
vi.mock('@/features/landing/check-availability/CheckAvailability', () => ({
  CheckAvailability: () => null,
}))
vi.mock('@/features/landing/FeaturesCarousel', () => ({
  FeaturesCarousel: () => null,
}))
vi.mock('@/features/landing/IntegrationsSection', () => ({
  IntegrationsSection: () => null,
}))
vi.mock('@/features/landing/ProfilesShowcase', () => ({
  ProfilesShowcase: () => null,
}))
vi.mock('@/lib/smart-account', () => ({ useSmartAccountContext: vi.fn() }))

const ADDRESS = '0x0000000000000000000000000000000000000abc'

type BeforeLoad = (ctx: {
  readonly context: {
    readonly queryClient:
      | Pick<QueryClient, 'fetchQuery'>
      | {
          readonly fetchQuery: () => unknown
        }
  }
  readonly search: { readonly landing?: boolean }
}) => Promise<void>

const beforeLoad = (Route.options as unknown as { beforeLoad: BeforeLoad })
  .beforeLoad

const runWith = (
  fetchQuery: () => Promise<boolean>,
  landing?: boolean,
): Promise<void> =>
  beforeLoad({
    context: { queryClient: { fetchQuery } },
    search: { landing },
  })

describe('/ beforeLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getConnectionCookie).mockReturnValue(ADDRESS)
  })

  it('redirects to the dashboard when the address has names', async () => {
    await expect(runWith(async () => true)).rejects.toEqual({
      redirect: { to: '/dashboard' },
    })
  })

  it('stays on the landing page when the address has none', async () => {
    await expect(runWith(async () => false)).resolves.toBeUndefined()
  })

  it('stays on the landing page when bigname cannot be read', async () => {
    await expect(
      runWith(async () => {
        throw new Error('bigname unavailable')
      }),
    ).resolves.toBeUndefined()
  })

  it.each([
    ['the landing page was asked for', ADDRESS, true],
    ['no wallet is connected', null, undefined],
    ['the cookie is not an address', 'not-an-address', undefined],
  ])('does not look names up when %s', async (_label, cookie, landing) => {
    vi.mocked(getConnectionCookie).mockReturnValue(cookie)
    const fetchQuery = vi.fn(async () => true)

    await expect(runWith(fetchQuery, landing)).resolves.toBeUndefined()
    expect(fetchQuery).not.toHaveBeenCalled()
  })
})

const listing = (names: readonly string[]) =>
  new Response(
    JSON.stringify({
      data: names.map((name) => ({
        name,
        display_name: name,
        namespace: 'ens',
        namehash: '0x01',
        registration_status: 'active',
        authority: 'ens_v2',
        relations: ['owner'],
        is_primary: false,
      })),
      page: { next_cursor: null, has_more: false, total_count: null },
      meta: { as_of: {} },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )

describe('/ beforeLoad with the bigname query', () => {
  const runWithBigname = () =>
    beforeLoad({
      context: { queryClient: new QueryClient() },
      search: {},
    })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getConnectionCookie).mockReturnValue(ADDRESS)
  })

  it('asks bigname for the owned names and redirects on a listed one', async () => {
    bignameFetch.mockResolvedValue(listing(['abc.addr.reverse', 'alice.eth']))

    await expect(runWithBigname()).rejects.toEqual({
      redirect: { to: '/dashboard' },
    })
    const url = new URL(String(bignameFetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe(`/v1/addresses/${ADDRESS}/names`)
    expect(url.searchParams.get('relation')).toBe('owner')
  })

  it('stays on the landing page when the address holds only hidden names', async () => {
    bignameFetch.mockResolvedValue(listing(['abc.addr.reverse']))

    await expect(runWithBigname()).resolves.toBeUndefined()
  })

  it('stays on the landing page when bigname cannot be reached', async () => {
    bignameFetch.mockRejectedValue(new TypeError('fetch failed'))

    await expect(runWithBigname()).resolves.toBeUndefined()
  })
})
