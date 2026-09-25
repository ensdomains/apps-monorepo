import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { Route } from './index'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useParams: ({ select }: { select: (params: { name: string }) => string }) =>
      select({ name: 'example.eth' }),
    useLoaderData: ({
      select,
    }: {
      select: (data: { fallback: undefined; name: string }) => unknown
    }) => select({ fallback: undefined, name: 'example.eth' }),
  }),
  redirect: (options: unknown) => ({ options }),
}))

vi.mock('@/features/profile/service/profileExpiry', () => ({
  profileExpiryQuery: vi.fn(),
}))

vi.mock('@/features/profile/service/profileOwner', () => ({
  profileOwnerQuery: vi.fn(),
}))

vi.mock('@/features/profile/service/profileRecords', () => ({
  profileRecordsQuery: vi.fn(),
}))

vi.mock('@/features/profile/service/profileRegistration', () => ({
  profileRegistrationQuery: vi.fn(),
}))

vi.mock('@/features/profile/components/view/ProfileView', () => ({
  ProfileView: ({ name }: { name: string }) => (
    <div data-testid="profile-view">{name}</div>
  ),
}))

vi.mock('@/features/profile/components/view/ProfileLoading', () => ({
  ProfileLoading: ({ name }: { name: string }) => (
    <div data-testid="profile-loading">{name}</div>
  ),
}))

const renderRouteOption = (option: 'component' | 'pendingComponent') => {
  const Component = Route.options[option] as ComponentType
  return render(<Component />)
}

const PROFILE_OWNER = '0x0000000000000000000000000000000000000001'

const runLoader = async (
  name: string,
  indexedRegistrationDate?: number,
  dnsSecEnabled = true,
) => {
  vi.mocked(profileRecordsQuery).mockImplementation(
    (queryName) => ({ kind: 'records', name: queryName }) as never,
  )
  vi.mocked(profileOwnerQuery).mockImplementation(
    (queryName) => ({ kind: 'owner', name: queryName }) as never,
  )
  vi.mocked(profileExpiryQuery).mockImplementation(
    (queryName, protocol) =>
      ({ kind: 'expiry', name: queryName, protocol }) as never,
  )
  vi.mocked(profileRegistrationQuery).mockImplementation(
    (queryName, protocol) =>
      ({ queryKey: ['registration', queryName, protocol] }) as never,
  )

  const ensureQueryData = vi.fn(
    async (query: {
      readonly kind?: string
      readonly name?: string
      readonly queryKey?: readonly [{ readonly $action?: string }]
    }) => {
      if (query.queryKey?.[0]?.$action === 'dnsSecEnabled') return dnsSecEnabled
      if (query.kind === 'records')
        return { coins: [], texts: [], indexedRegistrationDate }
      return { expiry: null }
    },
  )
  const fetchQuery = vi.fn().mockResolvedValue({
    owner: PROFILE_OWNER,
    protocol: 'v2',
  })
  const prefetchQuery = vi.fn().mockResolvedValue(undefined)
  const setQueryData = vi.fn()
  const loader = Route.options.loader as (args: {
    params: { name: string }
    context: { queryClient: unknown }
  }) => Promise<unknown>

  const outcome = await loader({
    params: { name },
    context: {
      queryClient: { ensureQueryData, fetchQuery, prefetchQuery, setQueryData },
    },
  }).catch((error: unknown) => error)

  return { ensureQueryData, fetchQuery, outcome, prefetchQuery, setQueryData }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/$name client-rendered profile route', () => {
  it('keeps the profile page and its data client-rendered', () => {
    expect(Route.options.ssr).toBe(false)
  })

  it('always renders the canonical profile view', () => {
    renderRouteOption('component')

    expect(screen.getByTestId('profile-view').textContent).toBe('example.eth')
  })

  it('always renders the canonical profile loading state while pending', () => {
    renderRouteOption('pendingComponent')

    expect(screen.getByTestId('profile-loading').textContent).toBe(
      'example.eth',
    )
  })

  it.each([
    ['ALICE.eth', 'alice.eth'],
    ['ＡＬＩＣＥ.eth', 'alice.eth'],
  ])('redirects %s to the canonical profile URL', async (name, canonicalName) => {
    const { ensureQueryData, fetchQuery, outcome, prefetchQuery } =
      await runLoader(name)

    expect(outcome).toEqual({
      options: {
        params: { name: canonicalName },
        to: '/$name',
        replace: true,
      },
    })
    expect(ensureQueryData).not.toHaveBeenCalled()
    expect(fetchQuery).not.toHaveBeenCalled()
    expect(prefetchQuery).not.toHaveBeenCalled()
  })

  it('rejects a name that cannot be normalized before loading profile data', async () => {
    const { ensureQueryData, fetchQuery, outcome, prefetchQuery } =
      await runLoader('foo..eth')

    expect(outcome).toBeInstanceOf(Error)
    expect((outcome as Error).message).toBe('Invalid ENS name')
    expect(ensureQueryData).not.toHaveBeenCalled()
    expect(fetchQuery).not.toHaveBeenCalled()
    expect(prefetchQuery).not.toHaveBeenCalled()
  })

  it('returns a fallback for an unsupported DNS TLD', async () => {
    const { ensureQueryData, fetchQuery, outcome } = await runLoader(
      'alice.xyz',
      undefined,
      false,
    )

    expect(outcome).toEqual({
      fallback: 'unsupported-tld',
      description: undefined,
      name: 'alice.xyz',
    })
    expect(profileRecordsQuery).toHaveBeenCalledWith('alice.xyz')
    expect(profileOwnerQuery).toHaveBeenCalledWith('alice.xyz')
    expect(fetchQuery).toHaveBeenCalledTimes(1)
    expect(ensureQueryData).toHaveBeenCalledTimes(2)
  })

  it('loads essential queries with one canonical name without waiting for display data', async () => {
    const { fetchQuery, outcome, prefetchQuery } = await runLoader('alice.eth')

    expect(outcome).toEqual({
      fallback: undefined,
      description: undefined,
      name: 'alice.eth',
    })
    expect(profileRecordsQuery).toHaveBeenCalledWith('alice.eth')
    expect(profileOwnerQuery).toHaveBeenCalledWith('alice.eth')
    expect(fetchQuery).toHaveBeenCalledWith({
      kind: 'owner',
      name: 'alice.eth',
      staleTime: 0,
    })
    expect(profileExpiryQuery).toHaveBeenCalledWith('alice.eth', 'v2')
    expect(profileRegistrationQuery).not.toHaveBeenCalled()
    expect(prefetchQuery).not.toHaveBeenCalled()
  })

  it('reuses indexed V2 registration without a second Domain request', async () => {
    const { setQueryData } = await runLoader('alice.eth', 1_800_000_000)

    expect(profileRegistrationQuery).toHaveBeenCalledWith('alice.eth', 'v2')
    expect(setQueryData).toHaveBeenCalledWith(
      ['registration', 'alice.eth', 'v2'],
      expect.any(Function),
    )
    const seed = setQueryData.mock.calls[0]?.[1] as (
      current: unknown,
    ) => unknown
    expect(seed(undefined)).toEqual({ registrationDate: 1_800_000_000 })
    expect(seed({ registrationDate: 2 })).toEqual({ registrationDate: 2 })
  })
})
