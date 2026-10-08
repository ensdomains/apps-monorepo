import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
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

vi.mock('@/features/profile/service/profileReverseName', () => ({
  profileReverseNameQuery: vi.fn(),
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

const runLoader = async (name: string) => {
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
      ({ kind: 'registration', name: queryName, protocol }) as never,
  )
  vi.mocked(profileReverseNameQuery).mockImplementation(
    (address) => ({ address, kind: 'reverse-name' }) as never,
  )

  const ensureQueryData = vi.fn(
    async (query: { readonly kind: string; readonly name: string }) => {
      if (query.kind === 'records') return { coins: [], texts: [] }
      return { expiry: null }
    },
  )
  const fetchQuery = vi.fn().mockResolvedValue({
    owner: PROFILE_OWNER,
    protocol: 'v2',
  })
  const prefetchQuery = vi.fn().mockResolvedValue(undefined)
  const loader = Route.options.loader as (args: {
    params: { name: string }
    context: { queryClient: unknown }
  }) => Promise<unknown>

  const outcome = await loader({
    params: { name },
    context: {
      queryClient: { ensureQueryData, fetchQuery, prefetchQuery },
    },
  }).catch((error: unknown) => error)

  return { ensureQueryData, fetchQuery, outcome, prefetchQuery }
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

  it('uses one canonical name for every profile query', async () => {
    const { outcome } = await runLoader('alice.eth')

    expect(outcome).toEqual({
      fallback: undefined,
      description: undefined,
      name: 'alice.eth',
    })
    expect(profileRecordsQuery).toHaveBeenCalledWith('alice.eth')
    expect(profileOwnerQuery).toHaveBeenCalledWith('alice.eth')
    expect(profileExpiryQuery).toHaveBeenCalledWith('alice.eth', 'v2')
    expect(profileRegistrationQuery).toHaveBeenCalledWith('alice.eth', 'v2')
    expect(profileReverseNameQuery).toHaveBeenCalledWith(PROFILE_OWNER)
  })
})

describe('/$name head', () => {
  type HeadContext = {
    loaderData?: { description?: string; name: string }
    params: { name: string }
  }
  type MetaTag = { content?: string; property?: string; title?: string }

  const runHead = (context: HeadContext) => {
    const head = Route.options.head as unknown as (context: HeadContext) => {
      meta: MetaTag[]
    }
    const { meta } = head(context)

    return {
      image: meta.find((tag) => tag.property === 'og:image')?.content,
      title: meta.find((tag) => 'title' in tag)?.title,
    }
  }

  it("uses the name's card once the loader has run", () => {
    expect(
      runHead({
        loaderData: { name: 'alice.eth' },
        params: { name: 'alice.eth' },
      }),
    ).toEqual({
      image: `${window.location.origin}/og/alice.eth.png`,
      title: 'alice.eth - ENS Profile',
    })
  })

  // The route is `ssr: false`, so this is the head a link-preview crawler gets.
  it("uses the name's card, canonicalised, before the loader has run", () => {
    expect(runHead({ params: { name: 'Alice.ETH' } })).toEqual({
      image: `${window.location.origin}/og/alice.eth.png`,
      title: 'alice.eth - ENS Profile',
    })
  })

  it('points a name that cannot be normalised at the invalid-name card', () => {
    expect(runHead({ params: { name: 'foo..eth' } })).toEqual({
      image: `${window.location.origin}/og/foo..eth.png`,
      title: 'ENS App',
    })
  })
})
